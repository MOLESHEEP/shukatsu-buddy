import { z } from "zod";
import { HttpError, idParam, readJson, withUser } from "@/lib/api";
import { query } from "@/lib/db";
import { assertCompany, getCompanyDetail } from "@/lib/data";
import { localToIso } from "@/lib/time";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withUser<Ctx>(async (_req, user, { params }) => {
  const detail = await getCompanyDetail(user.id, idParam((await params).id));
  if (!detail) throw new HttpError(404, "找不到这家公司");
  return detail;
});

const Patch = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  industry: z.string().max(60).optional(),
  channel: z.string().max(60).optional(),
  current_stage: z.string().max(40).optional(),
  status: z.enum(["active", "offer", "rejected", "withdrawn"]).optional(),
  next_action: z.string().max(200).optional(),
  next_deadline: z.string().nullable().optional(),
  notes: z.string().max(4000).optional(),
});

export const PATCH = withUser<Ctx>(async (req, user, { params }) => {
  const id = idParam((await params).id);
  await assertCompany(user.id, id);
  const body = await readJson(req, Patch);
  const fields: Record<string, unknown> = { ...body };
  if ("next_deadline" in body) fields.next_deadline = localToIso(body.next_deadline);
  // Reaching 内定 marks the application as an offer.
  if (body.current_stage === "内定" && !body.status) fields.status = "offer";

  const keys = Object.keys(fields);
  if (keys.length) {
    const sets = keys.map((k, i) => `${k} = $${i + 3}`).join(", ");
    await query(`UPDATE companies SET ${sets}, updated_at = now() WHERE id = $1 AND user_id = $2`, [id, user.id, ...keys.map((k) => fields[k])]);
  }
  return { ok: true };
});

export const DELETE = withUser<Ctx>(async (_req, user, { params }) => {
  const id = idParam((await params).id);
  await query(`DELETE FROM companies WHERE id = $1 AND user_id = $2`, [id, user.id]);
  return { ok: true };
});
