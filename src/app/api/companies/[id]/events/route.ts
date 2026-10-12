import { HttpError, idParam, readJson, withUser } from "@/lib/api";
import { query } from "@/lib/db";
import { assertCompany } from "@/lib/data";
import { localToIso } from "@/lib/time";
import { EventBody } from "@/lib/validators";

type Ctx = { params: Promise<{ id: string }> };

export const POST = withUser<Ctx>(async (req, user, { params }) => {
  const companyId = idParam((await params).id);
  await assertCompany(user.id, companyId);
  const b = await readJson(req, EventBody);
  const at = localToIso(b.starts_at);
  if (!at) throw new HttpError(400, "日期格式不正确");
  await query(`INSERT INTO events (company_id, kind, title, starts_at, location, prep) VALUES ($1, $2, $3, $4, $5, $6)`, [
    companyId,
    b.kind,
    b.title,
    at,
    b.location ?? "",
    b.prep ?? "",
  ]);
  return { ok: true };
});
