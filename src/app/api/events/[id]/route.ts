import { idParam, withUser } from "@/lib/api";
import { query } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = withUser<Ctx>(async (_req, user, { params }) => {
  await query(`DELETE FROM events WHERE id = $1 AND company_id IN (SELECT id FROM companies WHERE user_id = $2)`, [
    idParam((await params).id),
    user.id,
  ]);
  return { ok: true };
});
