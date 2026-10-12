import { z } from "zod";
import { HttpError, readJson, withAdmin } from "@/lib/api";
import { query, transaction } from "@/lib/db";

type Ctx = { params: Promise<{ batch: string }> };

async function batchId(params: Ctx["params"]) {
  const id = (await params).batch;
  if (!/^[\w-]{1,40}$/.test(id)) throw new HttpError(400, "无效的批次");
  return id;
}

/** Publish every draft in a batch at once. */
export const PATCH = withAdmin<Ctx>(async (req, _admin, { params }) => {
  const id = await batchId(params);
  const { action, confirmed } = await readJson(req, z.object({ action: z.literal("publish"), confirmed: z.boolean().optional() }));
  if (action === "publish" && confirmed !== true) throw new HttpError(400, "发布前请确认");
  const rows = await query(
    `UPDATE posts SET status = 'published', published_at = COALESCE(published_at, now()), updated_at = now()
      WHERE import_batch = $1 AND status = 'draft' RETURNING id`,
    [id],
  );
  await query(`UPDATE import_batches SET published = true WHERE id = $1`, [id]);
  return { published: rows.length };
});

/** Undo an import: deletes every post of the batch (including ones edited since). */
export const DELETE = withAdmin<Ctx>(async (_req, _admin, { params }) => {
  const id = await batchId(params);
  const deleted = await transaction(async (q) => {
    const rows = await q(`DELETE FROM posts WHERE import_batch = $1 RETURNING id`, [id]);
    await q(`DELETE FROM import_batches WHERE id = $1`, [id]);
    return rows.length;
  });
  return { deleted };
});
