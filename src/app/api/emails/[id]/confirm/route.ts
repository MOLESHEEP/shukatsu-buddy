import { z } from "zod";
import { HttpError, idParam, readJson, withUser } from "@/lib/api";
import { query, queryOne } from "@/lib/db";
import { findOrCreateCompany, assertCompany } from "@/lib/data";
import { localToIso } from "@/lib/time";
import { EventBody, TestBody } from "@/lib/validators";

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({
  company_id: z.number().int().nullable().optional(),
  company_name: z.string().trim().max(100).optional(),
  events: z.array(EventBody).max(10),
  test: TestBody.nullable().optional(),
  next_action: z.string().max(200).optional(),
  next_deadline: z.string().nullable().optional(),
});

/** User-confirmed result of a parsed email: write events / test / next step to the company card. */
export const POST = withUser<Ctx>(async (req, user, { params }) => {
  const emailId = idParam((await params).id);
  const email = await queryOne(`SELECT id FROM emails WHERE id = $1 AND user_id = $2`, [emailId, user.id]);
  if (!email) throw new HttpError(404, "找不到这封邮件");
  const b = await readJson(req, Body);

  let companyId = b.company_id ?? null;
  if (companyId) await assertCompany(user.id, companyId);
  else if (b.company_name) companyId = await findOrCreateCompany(user.id, b.company_name);
  else throw new HttpError(400, "请选择或填写公司");

  for (const e of b.events) {
    const at = localToIso(e.starts_at);
    if (!at) continue;
    await query(
      `INSERT INTO events (company_id, kind, title, starts_at, location, prep, source_email_id) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [companyId, e.kind, e.title, at, e.location ?? "", e.prep ?? "", emailId],
    );
  }
  if (b.test) {
    await query(`INSERT INTO tests (company_id, type, format, deadline, status, confidence) VALUES ($1, $2, $3, $4, 'todo', $5)`, [
      companyId,
      b.test.type,
      b.test.format,
      localToIso(b.test.deadline),
      b.test.confidence ?? null,
    ]);
  }
  if (b.next_action || b.next_deadline) {
    await query(
      `UPDATE companies SET next_action = COALESCE(NULLIF($3, ''), next_action), next_deadline = COALESCE($4, next_deadline), updated_at = now()
        WHERE id = $1 AND user_id = $2`,
      [companyId, user.id, b.next_action ?? "", localToIso(b.next_deadline)],
    );
  } else {
    await query(`UPDATE companies SET updated_at = now() WHERE id = $1`, [companyId]);
  }
  await query(`UPDATE emails SET confirmed = true WHERE id = $1`, [emailId]);
  return { company_id: companyId };
});
