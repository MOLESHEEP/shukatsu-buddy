import { z } from "zod";
import { HttpError, idParam, readJson, withUser } from "@/lib/api";
import { query, queryOne } from "@/lib/db";
import { REPORT_REASONS } from "@/lib/community";

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({
  reason: z.enum(Object.keys(REPORT_REASONS) as [string, ...string[]]),
  detail: z.string().trim().max(500).default(""),
});

export const POST = withUser<Ctx>(async (req, user, { params }) => {
  const id = idParam((await params).id);
  const post = await queryOne<{ user_id: number }>(`SELECT user_id FROM posts WHERE id = $1 AND status = 'published'`, [id]);
  if (!post) throw new HttpError(404, "找不到这篇分享");
  if (post.user_id === user.id) throw new HttpError(400, "不能举报自己的分享");
  const b = await readJson(req, Body);
  await query(
    `INSERT INTO post_reports (post_id, reporter_id, reason, detail) VALUES ($1, $2, $3, $4)
     ON CONFLICT (post_id, reporter_id) WHERE status = 'open' DO NOTHING`,
    [id, user.id, b.reason, b.detail],
  );
  return { ok: true };
});
