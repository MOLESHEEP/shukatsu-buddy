import { z } from "zod";
import { idParam, readJson, withAdmin } from "@/lib/api";
import { query } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

/** Hide or restore any post. */
export const PATCH = withAdmin<Ctx>(async (req, _admin, { params }) => {
  const id = idParam((await params).id);
  const { status } = await readJson(req, z.object({ status: z.enum(["published", "hidden"]) }));
  await query(
    `UPDATE posts SET status = $2::text, published_at = CASE WHEN $2::text = 'published' THEN COALESCE(published_at, now()) ELSE published_at END, updated_at = now() WHERE id = $1`,
    [id, status],
  );
  return { ok: true };
});

export const DELETE = withAdmin<Ctx>(async (_req, _admin, { params }) => {
  await query(`DELETE FROM posts WHERE id = $1`, [idParam((await params).id)]);
  return { ok: true };
});
