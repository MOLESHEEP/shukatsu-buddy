import "server-only";
import { z } from "zod";
import { query, queryOne, transaction } from "./db";
import { HttpError } from "./api";
import type { User } from "./auth";
import { findOrCreateCompany } from "./data";
import { rewardOpeningReport, type RewardResult } from "./points";
import { hit, hits } from "./throttle";
import { localToIso } from "./time";
import { companyKey, formatOpeningDate, type Opening, type OpeningFieldsValue, OpeningReportInput } from "./openings-shared";

/**
 * 本选考开放通知 (phase 1: admin entry + user reports, in-app notices only).
 *
 *   admin enters a record ──────────────────────────────┐
 *   user reports, public  → opening_reports 'pending' → admin approves (may edit) ─┤→ openings (one per company + 届)
 *   user reports, private → written straight into the user's own tracker (nobody else sees it)
 *
 * When a record is created, or its dates / link change, followers of that company (matching 届) get an
 * in-app notice. Notices reuse announcements (audience 'ids'), like review results do.
 */

type Q = Parameters<Parameters<typeof transaction>[0]>[0];

/** Public reports per user per day. */
const REPORTS_PER_DAY = 10;

// ---------- helpers ----------

type Values = {
  company_name: string;
  company_key: string;
  grad_year: number | null;
  opens_at: string | null; // ISO
  deadline: string | null; // ISO
  url: string;
  note: string;
};

/** Validated form fields → DB values. Date-only opens_at means the start of that day, date-only deadline its end. */
export function toValues(v: OpeningFieldsValue): Values {
  const opens = v.opens_at ? localToIso(v.opens_at.length === 10 ? `${v.opens_at}T00:00` : v.opens_at) : null;
  const deadline = v.deadline ? localToIso(v.deadline) : null;
  if (v.opens_at && !opens) throw new HttpError(400, "开放时间格式不对");
  if (v.deadline && !deadline) throw new HttpError(400, "截止时间格式不对");
  if (opens && deadline && deadline < opens) throw new HttpError(400, "截止时间不能早于开放时间");
  return {
    company_name: v.company_name.trim(),
    company_key: companyKey(v.company_name),
    grad_year: v.grad_year ?? null,
    opens_at: opens,
    deadline,
    url: v.url,
    note: v.note,
  };
}

const iso = (d: unknown) => (d instanceof Date ? d.toISOString() : (d as string | null));

function normOpening(r: Record<string, unknown>): Opening {
  return {
    id: Number(r.id),
    company_name: r.company_name as string,
    company_key: r.company_key as string,
    grad_year: (r.grad_year as number | null) ?? null,
    opens_at: iso(r.opens_at),
    deadline: iso(r.deadline),
    url: r.url as string,
    note: r.note as string,
    source: r.source as Opening["source"],
    reporter_name: (r.reporter_name as string | null) ?? null,
    following: Boolean(r.following),
    updated_at: iso(r.updated_at)!,
  };
}

const OPENING_COLS = `o.id, o.company_name, o.company_key, o.grad_year, o.opens_at, o.deadline, o.url, o.note, o.source, o.updated_at,
  CASE WHEN o.anonymous OR u.id IS NULL THEN NULL ELSE COALESCE(NULLIF(u.display_name, ''), '同学') END AS reporter_name`;

const phaseSql = `CASE WHEN o.deadline < now() THEN 2 WHEN o.opens_at > now() THEN 1 ELSE 0 END`;

function isUniqueViolation(err: unknown) {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";
}

// ---------- reads ----------

export async function listOpenings(userId: number, opts: { q?: string; scope?: "all" | "following"; grad?: number; showClosed?: boolean } = {}) {
  const params: unknown[] = [userId];
  const where: string[] = [];
  if (opts.q) {
    params.push(opts.q, companyKey(opts.q));
    where.push(`(o.company_name ILIKE '%' || $${params.length - 1} || '%' OR o.company_key LIKE '%' || $${params.length} || '%')`);
  }
  if (opts.grad) {
    params.push(opts.grad);
    where.push(`(o.grad_year IS NULL OR o.grad_year = $${params.length})`);
  }
  if (opts.scope === "following") where.push(`f.user_id IS NOT NULL`);
  // Closed records stay visible for a while so people can see last year's timing, but never crowd the top.
  if (!opts.showClosed) where.push(`(o.deadline IS NULL OR o.deadline > now() - interval '30 days')`);
  const rows = await query(
    `SELECT ${OPENING_COLS}, (f.user_id IS NOT NULL) AS following
       FROM openings o
       LEFT JOIN opening_follows f ON f.company_key = o.company_key AND f.user_id = $1
       LEFT JOIN users u ON u.id = o.reporter_id
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY ${phaseSql},
               CASE ${phaseSql} WHEN 0 THEN o.deadline WHEN 1 THEN o.opens_at END ASC NULLS LAST,
               o.deadline DESC NULLS LAST, o.id DESC
      LIMIT 200`,
    params,
  );
  return rows.map(normOpening);
}

export async function getOpening(id: number) {
  const row = await queryOne(`SELECT ${OPENING_COLS}, false AS following FROM openings o LEFT JOIN users u ON u.id = o.reporter_id WHERE o.id = $1`, [id]);
  return row ? normOpening(row) : null;
}

/** For a company in the user's tracker: is it followed, and what records exist for it. */
export async function openingsForCompany(userId: number, companyName: string) {
  const key = companyKey(companyName);
  const [rows, follow] = await Promise.all([
    query(
      `SELECT ${OPENING_COLS}, true AS following FROM openings o LEFT JOIN users u ON u.id = o.reporter_id
        WHERE o.company_key = $1 ORDER BY o.grad_year DESC NULLS LAST LIMIT 5`,
      [key],
    ),
    queryOne(`SELECT 1 FROM opening_follows WHERE user_id = $1 AND company_key = $2`, [userId, key]),
  ]);
  return { key, following: Boolean(follow), openings: rows.map((r) => ({ ...normOpening(r), following: Boolean(follow) })) };
}

export type MyReport = {
  id: number;
  opening_id: number | null;
  company_name: string;
  grad_year: number | null;
  opens_at: string | null;
  deadline: string | null;
  status: "pending" | "approved" | "rejected";
  review_note: string;
  reward: string;
  created_at: string;
};

export async function listMyReports(userId: number): Promise<MyReport[]> {
  const rows = await query(
    `SELECT id, opening_id, company_name, grad_year, opens_at, deadline, status, review_note, reward, created_at
       FROM opening_reports WHERE user_id = $1 ORDER BY created_at DESC LIMIT 30`,
    [userId],
  );
  return rows.map((r) => ({ ...(r as MyReport), opens_at: iso(r.opens_at), deadline: iso(r.deadline), created_at: iso(r.created_at)! }));
}

export async function listFollows(userId: number) {
  return query<{ company_key: string; company_name: string }>(
    `SELECT company_key, company_name FROM opening_follows WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId],
  );
}

// ---------- follows ----------

export async function follow(userId: number, companyName: string) {
  const name = companyName.trim();
  if (!name) throw new HttpError(400, "公司必填");
  const n = await queryOne<{ n: number }>(`SELECT count(*)::int AS n FROM opening_follows WHERE user_id = $1`, [userId]);
  if ((n?.n ?? 0) >= 300) throw new HttpError(400, "关注的公司太多了（最多 300 家）");
  await query(
    `INSERT INTO opening_follows (user_id, company_key, company_name) VALUES ($1, $2, $3) ON CONFLICT (user_id, company_key) DO NOTHING`,
    [userId, companyKey(name), name.slice(0, 100)],
  );
}

/** Follows every active company in the user's tracker. Returns how many new follows were added. */
export async function followTracker(userId: number): Promise<number> {
  const rows = await query<{ name: string }>(`SELECT DISTINCT name FROM companies WHERE user_id = $1 AND status = 'active'`, [userId]);
  const seen = new Map<string, string>();
  for (const r of rows) if (r.name.trim()) seen.set(companyKey(r.name), r.name.trim().slice(0, 100));
  if (!seen.size) return 0;
  const added = await query(
    `INSERT INTO opening_follows (user_id, company_key, company_name)
     SELECT $1, k, n FROM unnest($2::text[], $3::text[]) AS t(k, n)
     ON CONFLICT (user_id, company_key) DO NOTHING RETURNING company_key`,
    [userId, [...seen.keys()], [...seen.values()]],
  );
  return added.length;
}

export async function unfollow(userId: number, key: string) {
  await query(`DELETE FROM opening_follows WHERE user_id = $1 AND company_key = $2`, [userId, key]);
}

// ---------- tracker ----------

/**
 * Writes a record into the user's own tracker: finds or creates the company card, adds (or moves) the
 * 开放 / 截止 events, and sets the card's next deadline if it has none pending. Also follows the company.
 */
export async function addToTracker(userId: number, v: { company_name: string; opens_at: string | null; deadline: string | null; url: string }) {
  const companyId = await findOrCreateCompany(userId, v.company_name);
  const events = [
    v.opens_at ? { kind: "other", title: "本选考エントリー开放", at: v.opens_at } : null,
    v.deadline ? { kind: "deadline", title: "本选考エントリー截止", at: v.deadline } : null,
  ].filter((e): e is { kind: string; title: string; at: string } => e !== null);
  for (const e of events) {
    const moved = await query(`UPDATE events SET starts_at = $3, location = CASE WHEN $4 = '' THEN location ELSE $4 END WHERE company_id = $1 AND title = $2 RETURNING id`, [
      companyId,
      e.title,
      e.at,
      v.url,
    ]);
    if (!moved.length) {
      await query(`INSERT INTO events (company_id, kind, title, starts_at, location) VALUES ($1, $2, $3, $4, $5)`, [companyId, e.kind, e.title, e.at, v.url]);
    }
  }
  if (v.deadline) {
    await query(
      `UPDATE companies SET next_action = '本选考エントリー', next_deadline = $2, updated_at = now()
        WHERE id = $1 AND (next_deadline IS NULL OR next_deadline < now() OR next_action = '本选考エントリー')`,
      [companyId, v.deadline],
    );
  }
  if (v.url) {
    await query(
      `UPDATE companies SET notes = CASE WHEN notes = '' THEN $2 ELSE notes || E'\\n' || $2 END, updated_at = now()
        WHERE id = $1 AND position($3 IN notes) = 0`,
      [companyId, `本选考エントリー：${v.url}`, v.url],
    );
  }
  await follow(userId, v.company_name);
  return companyId;
}

// ---------- user reports ----------

export type ReportResult = { visibility: "public" | "private"; reportId: number | null; companyId: number | null };

export async function submitReport(user: User, input: z.infer<typeof OpeningReportInput>): Promise<ReportResult> {
  const v = toValues({ ...input, grad_year: input.grad_year === undefined ? user.grad_year : input.grad_year });

  if (input.visibility === "private") {
    const companyId = await addToTracker(user.id, v);
    return { visibility: "private", reportId: null, companyId };
  }

  if (input.opening_id) {
    const target = await queryOne(`SELECT id FROM openings WHERE id = $1`, [input.opening_id]);
    if (!target) throw new HttpError(404, "要纠错的记录已经不存在了，请刷新");
  }
  const dup = await queryOne(`SELECT 1 FROM opening_reports WHERE user_id = $1 AND company_key = $2 AND status = 'pending'`, [user.id, v.company_key]);
  if (dup) throw new HttpError(409, "你上报的这家公司还在审核中，审核完成后再提交新的信息吧");
  if ((await hits("opening_report", String(user.id), 24 * 60)) >= REPORTS_PER_DAY) {
    throw new HttpError(429, `每天最多公开上报 ${REPORTS_PER_DAY} 条，明天再来吧`);
  }
  await hit("opening_report", String(user.id));

  const row = await queryOne<{ id: number }>(
    `INSERT INTO opening_reports (user_id, opening_id, company_name, company_key, grad_year, opens_at, deadline, url, note, anonymous)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
    [user.id, input.opening_id ?? null, v.company_name, v.company_key, v.grad_year, v.opens_at, v.deadline, v.url, v.note, input.anonymous],
  );
  const companyId = input.add_to_tracker ? await addToTracker(user.id, v) : null;
  if (!input.add_to_tracker) await follow(user.id, v.company_name);
  return { visibility: "public", reportId: row!.id, companyId };
}

/** The reporter may withdraw a report that is still pending. */
export async function withdrawReport(userId: number, reportId: number) {
  const rows = await query(`DELETE FROM opening_reports WHERE id = $1 AND user_id = $2 AND status = 'pending' RETURNING id`, [reportId, userId]);
  if (!rows.length) throw new HttpError(409, "这条上报已经审核过了，不能撤回");
}

// ---------- writes shared by admin entry and approvals ----------

type Origin = { source: "admin" | "user"; reporterId: number | null; anonymous: boolean; actorId: number };
type Upserted = { id: number; created: boolean; changed: boolean; values: Values };

/**
 * Creates the record, or updates the existing one for the same company + 届 (or the given id).
 * `changed` is true when something followers care about (dates, link) is new.
 */
async function upsert(q: Q, v: Values, origin: Origin, targetId?: number | null): Promise<Upserted> {
  const [existing] = targetId
    ? await q(`SELECT id, opens_at, deadline, url FROM openings WHERE id = $1 FOR UPDATE`, [targetId])
    : await q(`SELECT id, opens_at, deadline, url FROM openings WHERE company_key = $1 AND COALESCE(grad_year, 0) = COALESCE($2::int, 0) FOR UPDATE`, [
        v.company_key,
        v.grad_year,
      ]);
  try {
    if (existing) {
      await q(
        `UPDATE openings SET company_name = $2, company_key = $3, grad_year = $4, opens_at = $5, deadline = $6, url = $7, note = $8, updated_at = now()
          WHERE id = $1`,
        [existing.id, v.company_name, v.company_key, v.grad_year, v.opens_at, v.deadline, v.url, v.note],
      );
      const changed = iso(existing.opens_at) !== v.opens_at || iso(existing.deadline) !== v.deadline || existing.url !== v.url;
      return { id: Number(existing.id), created: false, changed, values: v };
    }
    const [row] = await q<{ id: number }>(
      `INSERT INTO openings (company_name, company_key, grad_year, opens_at, deadline, url, note, source, reporter_id, anonymous, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
      [v.company_name, v.company_key, v.grad_year, v.opens_at, v.deadline, v.url, v.note, origin.source, origin.reporterId, origin.anonymous, origin.actorId],
    );
    return { id: Number(row.id), created: true, changed: true, values: v };
  } catch (err) {
    if (isUniqueViolation(err)) throw new HttpError(409, `已经有「${v.company_name}」${v.grad_year ? ` ${v.grad_year}届` : ""}的记录了，请直接编辑那一条`);
    throw err;
  }
}

/** In-app notice to followers of the company whose 届 matches. Returns how many users were notified. */
async function notifyFollowers(q: Q, u: Upserted, actorId: number, excludeIds: number[] = []): Promise<number> {
  if (!u.changed) return 0;
  const v = u.values;
  const gy = v.grad_year ? `${v.grad_year}届 ` : "";
  const upcoming = v.opens_at && Date.parse(v.opens_at) > Date.now();
  const title = u.created
    ? upcoming
      ? `「${v.company_name}」${gy}本选考开放时间公布`
      : `「${v.company_name}」${gy}本选考エントリー开放了`
    : `「${v.company_name}」${gy}本选考信息有更新`;
  const body = [
    v.opens_at && `开放：${formatOpeningDate(v.opens_at)}`,
    v.deadline && `截止：${formatOpeningDate(v.deadline)}`,
    v.note,
    "可以在「选考开放」里一键加入选考追踪，日历订阅会自动提醒截止。",
  ]
    .filter(Boolean)
    .join("\n");
  const rows = await q<{ n: number }>(
    `WITH target AS (
       SELECT array_agg(f.user_id) AS ids FROM opening_follows f JOIN users u ON u.id = f.user_id
        WHERE f.company_key = $1 AND u.status = 'active'
          AND ($2::int IS NULL OR u.grad_year IS NULL OR u.grad_year = $2::int)
          AND NOT (f.user_id = ANY($3::bigint[]))
     ), ins AS (
       INSERT INTO announcements (title, body, link, level, audience, user_ids, created_by)
       SELECT $4, $5, $6, 'important', 'ids', ids, $7 FROM target WHERE ids IS NOT NULL
       RETURNING cardinality(user_ids) AS n
     )
     SELECT COALESCE((SELECT n FROM ins), 0)::int AS n`,
    [v.company_key, v.grad_year, excludeIds, title, body, `/openings?focus=${u.id}#o-${u.id}`, actorId],
  );
  return rows[0]?.n ?? 0;
}

async function notifyUser(q: Q, userId: number, title: string, body: string, link: string, actorId: number) {
  await q(`INSERT INTO announcements (title, body, link, level, audience, user_ids, created_by) VALUES ($1, $2, $3, 'info', 'ids', ARRAY[$4::bigint], $5)`, [
    title,
    body,
    link,
    userId,
    actorId,
  ]);
}

// ---------- admin ----------

export type AdminResult = { id: number; created: boolean; notified: number };

/** Admin entry: creates the record, or updates the one for the same company + 届. Followers are notified if dates / link changed. */
export async function saveOpening(admin: User, fields: OpeningFieldsValue, opts: { id?: number; notify?: boolean } = {}): Promise<AdminResult> {
  const v = toValues(fields);
  return transaction(async (q) => {
    if (opts.id) {
      const [exists] = await q(`SELECT 1 FROM openings WHERE id = $1`, [opts.id]);
      if (!exists) throw new HttpError(404, "这条记录已经不存在了");
    }
    const u = await upsert(q, v, { source: "admin", reporterId: null, anonymous: true, actorId: admin.id }, opts.id);
    const notified = opts.notify === false ? 0 : await notifyFollowers(q, u, admin.id);
    return { id: u.id, created: u.created, notified };
  });
}

export async function deleteOpening(id: number) {
  const rows = await query(`DELETE FROM openings WHERE id = $1 RETURNING id`, [id]);
  if (!rows.length) throw new HttpError(404, "这条记录已经不存在了");
}

export type ReportRow = {
  id: number;
  opening_id: number | null;
  company_name: string;
  grad_year: number | null;
  opens_at: string | null;
  deadline: string | null;
  url: string;
  note: string;
  anonymous: boolean;
  status: "pending" | "approved" | "rejected";
  review_note: string;
  reward: string;
  created_at: string;
  reviewed_at: string | null;
  reporter_id: number;
  reporter_email: string;
  reviewer_email: string | null;
  /** The record this report would update (by id for corrections, else same company + 届). */
  existing: Opening | null;
};

export async function listReports(status: "pending" | "approved" | "rejected"): Promise<ReportRow[]> {
  const rows = await query(
    `SELECT r.id, r.opening_id, r.company_name, r.grad_year, r.opens_at, r.deadline, r.url, r.note, r.anonymous, r.status,
            r.review_note, r.reward, r.created_at, r.reviewed_at, r.user_id AS reporter_id, u.email AS reporter_email, a.email AS reviewer_email,
            COALESCE(r.opening_id, (SELECT o.id FROM openings o WHERE o.company_key = r.company_key AND COALESCE(o.grad_year, 0) = COALESCE(r.grad_year, 0))) AS existing_id
       FROM opening_reports r JOIN users u ON u.id = r.user_id LEFT JOIN users a ON a.id = r.reviewer_id
      WHERE r.status = $1
      ORDER BY ${status === "pending" ? "r.created_at ASC" : "r.reviewed_at DESC NULLS LAST"} LIMIT 100`,
    [status],
  );
  const ids = [...new Set(rows.map((r) => r.existing_id).filter((x): x is number => x != null))];
  const existing = ids.length
    ? (await query(`SELECT ${OPENING_COLS}, false AS following FROM openings o LEFT JOIN users u ON u.id = o.reporter_id WHERE o.id = ANY($1::bigint[])`, [ids])).map(normOpening)
    : [];
  const byId = new Map(existing.map((o) => [o.id, o]));
  return rows.map((r) => {
    const { existing_id, ...rest } = r as ReportRow & { existing_id: number | null };
    return {
      ...rest,
      opens_at: iso(r.opens_at),
      deadline: iso(r.deadline),
      created_at: iso(r.created_at)!,
      reviewed_at: iso(r.reviewed_at),
      existing: existing_id != null ? (byId.get(existing_id) ?? null) : null,
    };
  });
}

export async function pendingReportCount() {
  return (await queryOne<{ n: number }>(`SELECT count(*)::int AS n FROM opening_reports WHERE status = 'pending'`))?.n ?? 0;
}

/**
 * Approves a pending report. The admin may correct the fields first (`fields`); otherwise the report's own values are used.
 * Creates or updates the public record, rewards the reporter once, and notifies followers if anything changed.
 */
export async function approveReport(admin: User, reportId: number, fields?: OpeningFieldsValue): Promise<AdminResult & { reward: RewardResult }> {
  return transaction(async (q) => {
    const [r] = await q(`SELECT * FROM opening_reports WHERE id = $1 AND status = 'pending' FOR UPDATE`, [reportId]);
    if (!r) throw new HttpError(409, "这条上报的状态已经变了（可能已被处理或撤回），请刷新");
    const v: Values = fields
      ? toValues(fields)
      : {
          company_name: r.company_name,
          company_key: r.company_key,
          grad_year: r.grad_year,
          opens_at: iso(r.opens_at),
          deadline: iso(r.deadline),
          url: r.url,
          note: r.note,
        };
    // A correction whose target was deleted meanwhile falls back to matching by company + 届.
    let target: number | null = r.opening_id ? Number(r.opening_id) : null;
    if (target && !(await q(`SELECT 1 FROM openings WHERE id = $1`, [target])).length) target = null;
    const u = await upsert(q, v, { source: "user", reporterId: Number(r.user_id), anonymous: r.anonymous, actorId: admin.id }, target);
    await q(`UPDATE opening_reports SET status = 'approved', opening_id = $2, reviewer_id = $3, reviewed_at = now() WHERE id = $1`, [reportId, u.id, admin.id]);
    const reward = await rewardOpeningReport(q, reportId);
    const notified = await notifyFollowers(q, u, admin.id, [Number(r.user_id)]);
    const pts = reward.awarded ? `，获得 ${reward.awarded} point` : reward.capped ? "（今天获得的 point 已达上限，这条不计分）" : "";
    await notifyUser(
      q,
      Number(r.user_id),
      `你上报的选考信息已通过审核${reward.awarded ? ` · +${reward.awarded} point` : ""}`,
      `「${v.company_name}」的本选考信息已公开${notified ? `，已通知 ${notified} 位关注这家公司的同学` : ""}${pts}。谢谢分享！`,
      `/openings?focus=${u.id}#o-${u.id}`,
      admin.id,
    );
    return { id: u.id, created: u.created, notified, reward };
  });
}

export async function rejectReport(admin: User, reportId: number, note: string) {
  return transaction(async (q) => {
    const [r] = await q<{ user_id: number; company_name: string }>(
      `UPDATE opening_reports SET status = 'rejected', review_note = $2, reviewer_id = $3, reviewed_at = now()
        WHERE id = $1 AND status = 'pending' RETURNING user_id, company_name`,
      [reportId, note, admin.id],
    );
    if (!r) throw new HttpError(409, "这条上报的状态已经变了（可能已被处理或撤回），请刷新");
    await notifyUser(q, Number(r.user_id), "你上报的选考信息未通过审核", `「${r.company_name}」：${note || "信息无法确认"}。可以补充官方链接后重新上报。`, "/openings?tab=mine", admin.id);
  });
}
