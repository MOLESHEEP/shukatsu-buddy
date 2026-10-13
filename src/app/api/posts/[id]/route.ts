import { z } from "zod";
import { HttpError, idParam, readJson, withUser } from "@/lib/api";
import { query, queryOne } from "@/lib/db";
import { PostInput } from "@/lib/validators";
import { submitForReview } from "@/lib/review";

export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({
  post: PostInput.optional(),
  action: z.enum(["save", "publish", "unpublish"]).default("save"),
  /** Must be true to publish: the author has reviewed the final text in the preview. */
  confirmed: z.boolean().optional(),
});

async function own(userId: number, id: number) {
  const row = await queryOne<{ status: string }>(`SELECT status FROM posts WHERE id = $1 AND user_id = $2`, [id, userId]);
  if (!row) throw new HttpError(404, "找不到这篇分享");
  return row;
}

export const PATCH = withUser<Ctx>(async (req, user, { params }) => {
  const id = idParam((await params).id);
  const current = await own(user.id, id);
  const { post: p, action, confirmed } = await readJson(req, Body);
  if (current.status === "hidden" && action !== "save") throw new HttpError(403, "这篇分享已被管理员隐藏，暂时不能重新发布");
  // Public content only changes through review: edits to a live (or queued) post must be resubmitted.
  if (p && action === "save" && (current.status === "published" || current.status === "pending")) {
    throw new HttpError(400, "已发布的分享修改后需要重新审核，请用「预览并更新」提交");
  }
  if (action === "publish" && confirmed !== true) throw new HttpError(400, "请先在预览中确认内容后再发布");

  if (p) {
    await query(
      `UPDATE posts SET kind = $3, company_name = $4, industry = $5, role = $6, occurred_on = ($7::text || '-01')::date,
              ended_on = ($8::text || '-01')::date, grad_year = $9, stage = $10, result = $11, employment_type = $12, rating = $13,
              title = $14, body = $15, tags = $16, anonymous = $17, notes = $18, updated_at = now()
        WHERE id = $1 AND user_id = $2`,
      [
        id,
        user.id,
        p.kind,
        p.company_name,
        p.industry,
        p.role,
        p.occurred_on,
        p.kind === "work" ? (p.ended_on ?? null) : null,
        p.grad_year ?? null,
        p.stage,
        p.result,
        p.employment_type,
        p.rating ?? null,
        p.title,
        p.body,
        p.tags,
        p.anonymous,
        p.notes,
      ],
    );
  }

  if (action === "publish") {
    // Goes to review; AI may approve (and reward a point) or reject right away, otherwise an admin decides.
    return { ok: true, review: await submitForReview(id, user.id) };
  }
  if (action === "unpublish") {
    await query(`UPDATE posts SET status = 'draft', updated_at = now() WHERE id = $1 AND status IN ('published', 'pending', 'rejected')`, [id]);
  }
  return { ok: true };
});

export const DELETE = withUser<Ctx>(async (_req, user, { params }) => {
  await query(`DELETE FROM posts WHERE id = $1 AND user_id = $2`, [idParam((await params).id), user.id]);
  return { ok: true };
});
