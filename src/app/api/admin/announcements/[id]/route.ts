import { z } from "zod";
import { idParam, readJson, withAdmin } from "@/lib/api";
import { query } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

/** Withdraw (hide from users) or restore an announcement. */
export const PATCH = withAdmin<Ctx>(async (req, _admin, { params }) => {
  const { withdrawn } = await readJson(req, z.object({ withdrawn: z.boolean() }));
  await query(`UPDATE announcements SET withdrawn = $2 WHERE id = $1`, [idParam((await params).id), withdrawn]);
  return { ok: true };
});

export const DELETE = withAdmin<Ctx>(async (_req, _admin, { params }) => {
  await query(`DELETE FROM announcements WHERE id = $1`, [idParam((await params).id)]);
  return { ok: true };
});
