import { idParam, readJson, withUser } from "@/lib/api";
import { query } from "@/lib/db";
import { localToIso } from "@/lib/time";
import { TestBody } from "@/lib/validators";

type Ctx = { params: Promise<{ id: string }> };

const owned = `id = $1 AND company_id IN (SELECT id FROM companies WHERE user_id = $2)`;

export const PATCH = withUser<Ctx>(async (req, user, { params }) => {
  const id = idParam((await params).id);
  const b = await readJson(req, TestBody.partial());
  await query(
    `UPDATE tests SET type = COALESCE($3, type), format = COALESCE($4, format), status = COALESCE($5, status),
            deadline = CASE WHEN $6::boolean THEN $7::timestamptz ELSE deadline END
      WHERE ${owned}`,
    [id, user.id, b.type ?? null, b.format ?? null, b.status ?? null, "deadline" in b, localToIso(b.deadline)],
  );
  return { ok: true };
});

export const DELETE = withUser<Ctx>(async (_req, user, { params }) => {
  await query(`DELETE FROM tests WHERE ${owned}`, [idParam((await params).id), user.id]);
  return { ok: true };
});
