import { HttpError, idParam, withUser } from "@/lib/api";
import { query, queryOne } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

/** Toggles the viewer's "有帮助" on a published post. */
export const POST = withUser<Ctx>(async (_req, user, { params }) => {
  const id = idParam((await params).id);
  const post = await queryOne(`SELECT 1 FROM posts WHERE id = $1 AND status = 'published'`, [id]);
  if (!post) throw new HttpError(404, "找不到这篇分享");
  const removed = await query(`DELETE FROM post_votes WHERE post_id = $1 AND user_id = $2 RETURNING 1`, [id, user.id]);
  if (!removed.length) await query(`INSERT INTO post_votes (post_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [id, user.id]);
  const count = await queryOne<{ n: number }>(`SELECT count(*)::int AS n FROM post_votes WHERE post_id = $1`, [id]);
  return { voted: !removed.length, votes: count?.n ?? 0 };
});
