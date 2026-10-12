import { z } from "zod";
import { idParam, readJson, withUser } from "@/lib/api";
import { query } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

const Patch = z.object({
  is_material: z.boolean().optional(),
  material_tag: z.string().max(20).optional(),
  rewritten: z.string().max(6000).optional(),
});

export const PATCH = withUser<Ctx>(async (req, user, { params }) => {
  const id = idParam((await params).id);
  const b = await readJson(req, Patch);
  await query(
    `UPDATE es_docs SET is_material = COALESCE($3, is_material), material_tag = COALESCE($4, material_tag), rewritten = COALESCE($5, rewritten)
      WHERE id = $1 AND user_id = $2`,
    [id, user.id, b.is_material ?? null, b.material_tag ?? null, b.rewritten ?? null],
  );
  return { ok: true };
});

export const DELETE = withUser<Ctx>(async (_req, user, { params }) => {
  await query(`DELETE FROM es_docs WHERE id = $1 AND user_id = $2`, [idParam((await params).id), user.id]);
  return { ok: true };
});
