import { idParam, readJson, withUser } from "@/lib/api";
import { query } from "@/lib/db";
import { assertCompany } from "@/lib/data";
import { localToIso } from "@/lib/time";
import { TestBody } from "@/lib/validators";

type Ctx = { params: Promise<{ id: string }> };

export const POST = withUser<Ctx>(async (req, user, { params }) => {
  const companyId = idParam((await params).id);
  await assertCompany(user.id, companyId);
  const b = await readJson(req, TestBody);
  await query(`INSERT INTO tests (company_id, type, format, deadline, status, confidence) VALUES ($1, $2, $3, $4, $5, $6)`, [
    companyId,
    b.type,
    b.format,
    localToIso(b.deadline),
    b.status,
    b.confidence ?? null,
  ]);
  return { ok: true };
});
