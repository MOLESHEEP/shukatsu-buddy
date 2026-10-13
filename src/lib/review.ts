import "server-only";
import { query, queryOne, transaction } from "./db";
import { reviewPost } from "./llm/tasks";
import { isDemoMode } from "./llm/provider";
import type { PostReview } from "./llm/schemas";
import { getPointSettings, rewardPost, type RewardResult } from "./points";
import { hit, hits } from "./throttle";
import { VIOLATION_LABELS } from "./community";

/**
 * Publishing a 面试经验 / 工作体验 goes through review:
 *   author submits → status 'pending' → AI review (if enabled)
 *     approve → 'published' + point     reject → 'rejected' (author sees why, can edit and resubmit)
 *     unsure / AI off / AI error → stays 'pending' for an admin
 * An admin can approve or reject anything pending or rejected.
 */

export type ReviewOutcome = { status: "published" | "pending" | "rejected"; note: string; reward: RewardResult | null };

/** AI reviews per author per day; beyond this, submissions simply wait for an admin. */
const AI_REVIEWS_PER_DAY = 20;

type Q = Parameters<Parameters<typeof transaction>[0]>[0];

function aiNote(r: PostReview) {
  const labels = r.violations.map((v) => VIOLATION_LABELS[v] ?? v);
  return [labels.length ? `【${labels.join("、")}】` : "", r.reason_zh.trim()].join("").slice(0, 500);
}

async function notify(q: Q, userId: number, title: string, body: string, link: string, actorId: number | null) {
  await q(`INSERT INTO announcements (title, body, link, level, audience, user_ids, created_by) VALUES ($1, $2, $3, 'info', 'ids', ARRAY[$4::bigint], $5)`, [
    title,
    body,
    link,
    userId,
    actorId,
  ]);
}

type Decision = { by: "ai" | "admin"; reviewerId?: number | null; note?: string; /** Only apply if the post wasn't resubmitted meanwhile. */ submittedAt?: Date };

export async function approvePost(postId: number, d: Decision): Promise<ReviewOutcome | null> {
  return transaction(async (q) => {
    const rows = await q<{ user_id: number; title: string }>(
      `UPDATE posts SET status = 'published', published_at = COALESCE(published_at, now()), review_by = $2, reviewer_id = $3,
              reviewed_at = now(), review_note = $4, updated_at = now()
        WHERE id = $1 AND status IN ('pending', 'rejected') AND ($5::timestamptz IS NULL OR submitted_at = $5::timestamptz)
        RETURNING user_id, title`,
      [postId, d.by, d.reviewerId ?? null, d.note ?? "", d.submittedAt ?? null],
    );
    if (!rows.length) return null;
    const reward = await rewardPost(q, postId);
    if (d.by === "admin") {
      const pts = reward.awarded ? `，获得 ${reward.awarded} point` : reward.capped ? "（今天获得的 point 已达上限，这篇不计分）" : "";
      await notify(q, rows[0].user_id, `你的分享已通过审核${reward.awarded ? ` · +${reward.awarded} point` : ""}`, `《${rows[0].title}》已公开${pts}。`, `/community/${postId}`, d.reviewerId ?? null);
    }
    return { status: "published", note: d.note ?? "", reward };
  });
}

export async function rejectPost(postId: number, d: Decision & { note: string }): Promise<ReviewOutcome | null> {
  return transaction(async (q) => {
    const rows = await q<{ user_id: number; title: string }>(
      `UPDATE posts SET status = 'rejected', review_by = $2, reviewer_id = $3, reviewed_at = now(), review_note = $4, updated_at = now()
        WHERE id = $1 AND status IN ('pending', 'rejected', 'published') AND ($5::timestamptz IS NULL OR submitted_at = $5::timestamptz)
        RETURNING user_id, title`,
      [postId, d.by, d.reviewerId ?? null, d.note, d.submittedAt ?? null],
    );
    if (!rows.length) return null;
    if (d.by === "admin") {
      await notify(q, rows[0].user_id, "你的分享未通过审核", `《${rows[0].title}》：${d.note || "不符合社区规则"}。修改后可以重新提交。`, `/community/${postId}`, d.reviewerId ?? null);
    }
    return { status: "rejected", note: d.note, reward: null };
  });
}

/** Called when the author publishes (or re-publishes after editing). */
export async function submitForReview(postId: number, authorId: number): Promise<ReviewOutcome> {
  const row = await queryOne<{ submitted_at: Date; kind: "interview" | "work"; company_name: string; role: string; title: string; body: string; tags: string[] }>(
    `UPDATE posts SET status = 'pending', submitted_at = date_trunc('milliseconds', clock_timestamp()), review_note = '', review_by = '', reviewer_id = NULL, reviewed_at = NULL, updated_at = now()
      WHERE id = $1 AND user_id = $2
      RETURNING submitted_at, kind, company_name, role, title, body, tags`,
    [postId, authorId],
  );
  if (!row) return { status: "pending", note: "", reward: null };
  const pending = (note: string): ReviewOutcome => ({ status: "pending", note, reward: null });

  const settings = await getPointSettings();
  if (!settings.aiReview || (await isDemoMode())) return pending("");
  if ((await hits("post_review", String(authorId), 24 * 60)) >= AI_REVIEWS_PER_DAY) return pending("");
  await hit("post_review", String(authorId));

  let r: PostReview;
  try {
    r = await reviewPost(row);
  } catch (err) {
    const msg = `AI 审核失败，转人工：${err instanceof Error ? err.message : "未知错误"}`.slice(0, 300);
    await query(`UPDATE posts SET review_note = $3 WHERE id = $1 AND submitted_at = $2`, [postId, row.submitted_at, msg]);
    return pending("");
  }

  const note = aiNote(r);
  const decision = { by: "ai" as const, submittedAt: row.submitted_at };
  if (r.decision === "approve" && !r.violations.length) return (await approvePost(postId, { ...decision, note })) ?? pending("");
  if (r.decision === "reject") return (await rejectPost(postId, { ...decision, note: note || "不符合社区规则" })) ?? pending("");
  // Unsure: keep the AI's reasoning for the admin; the author just sees "waiting for review".
  await query(`UPDATE posts SET review_note = $3 WHERE id = $1 AND submitted_at = $2 AND status = 'pending'`, [postId, row.submitted_at, `AI 拿不准：${note}`.slice(0, 500)]);
  return pending("");
}

// ---------- admin queue ----------

export type ReviewRow = {
  id: number;
  kind: "interview" | "work";
  status: string;
  company_name: string;
  role: string;
  title: string;
  body: string;
  tags: string[];
  review_note: string;
  review_by: string;
  reward: string;
  submitted_at: string | null;
  reviewed_at: string | null;
  author_id: number;
  author_email: string;
  reviewer_email: string | null;
};

export async function listReviewQueue(status: "pending" | "rejected" | "published") {
  const order = status === "pending" ? "p.submitted_at ASC NULLS LAST" : "p.reviewed_at DESC NULLS LAST";
  const rows = await query(
    `SELECT p.id, p.kind, p.status, p.company_name, p.role, p.title, p.body, p.tags, p.review_note, p.review_by, p.reward,
            p.submitted_at, p.reviewed_at, p.user_id AS author_id, u.email AS author_email, r.email AS reviewer_email
       FROM posts p JOIN users u ON u.id = p.user_id LEFT JOIN users r ON r.id = p.reviewer_id
      WHERE p.status = $1 ${status === "published" ? "AND p.review_by <> ''" : ""}
      ORDER BY ${order} LIMIT 100`,
    [status],
  );
  return rows.map((r) => ({
    ...(r as ReviewRow),
    submitted_at: r.submitted_at ? (r.submitted_at as Date).toISOString() : null,
    reviewed_at: r.reviewed_at ? (r.reviewed_at as Date).toISOString() : null,
  }));
}

export async function pendingReviewCount() {
  return (await queryOne<{ n: number }>(`SELECT count(*)::int AS n FROM posts WHERE status = 'pending'`))?.n ?? 0;
}
