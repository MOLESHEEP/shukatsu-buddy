import { z } from "zod";
import { HttpError, idParam, readJson, withAdmin } from "@/lib/api";
import { query, queryOne } from "@/lib/db";
import { FEEDBACK_STATUS } from "@/lib/feedback";

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({
  status: z.enum(Object.keys(FEEDBACK_STATUS) as [string, ...string[]]).optional(),
  /** Setting a reply notifies the user (red dot until they open 意见反馈). */
  reply: z.string().trim().max(3000).optional(),
});

export const PATCH = withAdmin<Ctx>(async (req, _admin, { params }) => {
  const id = idParam((await params).id);
  const cur = await queryOne<{ reply: string; status: string }>(`SELECT reply, status FROM feedback WHERE id = $1`, [id]);
  if (!cur) throw new HttpError(404, "找不到这条反馈");
  const b = await readJson(req, Body);
  const replyChanged = b.reply !== undefined && b.reply !== cur.reply;
  // Replying to a brand-new item moves it to 处理中 unless a status was chosen explicitly.
  const status = b.status ?? (replyChanged && b.reply && cur.status === "new" ? "doing" : cur.status);
  await query(
    `UPDATE feedback SET status = $2,
            reply = COALESCE($3, reply),
            replied_at = CASE WHEN $4::boolean THEN now() ELSE replied_at END,
            reply_seen = CASE WHEN $4::boolean AND $3 <> '' THEN false ELSE reply_seen END,
            updated_at = now()
      WHERE id = $1`,
    [id, status, b.reply ?? null, replyChanged],
  );
  return { ok: true, status };
});

export const DELETE = withAdmin<Ctx>(async (_req, _admin, { params }) => {
  await query(`DELETE FROM feedback WHERE id = $1`, [idParam((await params).id)]);
  return { ok: true };
});
