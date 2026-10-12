import { z } from "zod";
import { HttpError, readJson, withAdmin } from "@/lib/api";
import { query } from "@/lib/db";

type Ctx = { params: Promise<{ code: string }> };

async function codeParam(params: Ctx["params"]) {
  const code = decodeURIComponent((await params).code).toUpperCase();
  if (!/^[A-Z0-9-]{4,20}$/.test(code)) throw new HttpError(400, "无效的邀请码");
  return code;
}

export const PATCH = withAdmin<Ctx>(async (req, _admin, { params }) => {
  const code = await codeParam(params);
  const { disabled } = await readJson(req, z.object({ disabled: z.boolean() }));
  await query(`UPDATE invite_codes SET disabled = $2 WHERE code = $1`, [code, disabled]);
  return { ok: true };
});

/** Deleting a code doesn't affect accounts already registered with it. */
export const DELETE = withAdmin<Ctx>(async (_req, _admin, { params }) => {
  await query(`DELETE FROM invite_codes WHERE code = $1`, [await codeParam(params)]);
  return { ok: true };
});
