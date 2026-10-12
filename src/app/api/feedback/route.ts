import { z } from "zod";
import { HttpError, readJson, withUser } from "@/lib/api";
import { query, queryOne } from "@/lib/db";
import { FEEDBACK_CATEGORIES, FEEDBACK_DAILY_LIMIT } from "@/lib/feedback";

const Body = z.object({
  category: z.enum(Object.keys(FEEDBACK_CATEGORIES) as [string, ...string[]]),
  content: z.string().trim().min(5, "请再多写几个字（至少 5 字）").max(3000, "最多 3000 字"),
  page: z.string().max(200).default(""),
});

export const POST = withUser(async (req, user) => {
  const b = await readJson(req, Body);
  const recent = await queryOne<{ n: number }>(`SELECT count(*)::int AS n FROM feedback WHERE user_id = $1 AND created_at > now() - interval '1 day'`, [user.id]);
  if ((recent?.n ?? 0) >= FEEDBACK_DAILY_LIMIT) throw new HttpError(429, `每天最多提交 ${FEEDBACK_DAILY_LIMIT} 条反馈，明天再来吧`);
  const row = await queryOne<{ id: number }>(`INSERT INTO feedback (user_id, category, content, page) VALUES ($1, $2, $3, $4) RETURNING id`, [
    user.id,
    b.category,
    b.content,
    b.page.startsWith("/") ? b.page : "",
  ]);
  return { id: row!.id };
});

/** The user's own feedback; opening the list marks replies as read. */
export const GET = withUser(async (_req, user) => {
  const items = await query(`SELECT * FROM feedback WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`, [user.id]);
  await query(`UPDATE feedback SET reply_seen = true WHERE user_id = $1 AND reply_seen = false`, [user.id]);
  return { items };
});
