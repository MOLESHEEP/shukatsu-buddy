import { z } from "zod";
import { HttpError, idParam, readJson, withAdmin } from "@/lib/api";
import { query, queryOne } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({ action: z.enum(["dismiss", "hide", "delete"]) });

/**
 * dismiss: the post is fine; close this report.
 * hide:    hide the post from everyone but its author; resolve all open reports on it.
 * delete:  delete the post (its reports go with it).
 */
export const PATCH = withAdmin<Ctx>(async (req, _admin, { params }) => {
  const id = idParam((await params).id);
  const report = await queryOne<{ post_id: number }>(`SELECT post_id FROM post_reports WHERE id = $1`, [id]);
  if (!report) throw new HttpError(404, "找不到这条举报");
  const { action } = await readJson(req, Body);
  if (action === "dismiss") {
    await query(`UPDATE post_reports SET status = 'dismissed', resolved_at = now() WHERE id = $1`, [id]);
  } else if (action === "hide") {
    await query(`UPDATE posts SET status = 'hidden', updated_at = now() WHERE id = $1`, [report.post_id]);
    await query(`UPDATE post_reports SET status = 'resolved', resolved_at = now() WHERE post_id = $1 AND status = 'open'`, [report.post_id]);
  } else {
    await query(`DELETE FROM posts WHERE id = $1`, [report.post_id]);
  }
  return { ok: true };
});
