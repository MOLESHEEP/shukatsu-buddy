import { randomBytes } from "node:crypto";
import { z } from "zod";
import { readJson, withUser } from "@/lib/api";
import { query } from "@/lib/db";
import { destroySession } from "@/lib/auth";

const Patch = z.object({
  display_name: z.string().trim().max(40).optional(),
  grad_year: z.number().int().min(2020).max(2040).nullable().optional(),
  major: z.string().max(60).optional(),
  jp_level: z.string().max(40).optional(),
  rotate_ics: z.boolean().optional(),
});

export const PATCH = withUser(async (req, user) => {
  const b = await readJson(req, Patch);
  await query(
    `UPDATE users SET display_name = COALESCE($2, display_name), grad_year = CASE WHEN $3::boolean THEN $4::int ELSE grad_year END,
            major = COALESCE($5, major), jp_level = COALESCE($6, jp_level), ics_token = COALESCE($7, ics_token)
      WHERE id = $1`,
    [
      user.id,
      b.display_name ?? null,
      "grad_year" in b,
      b.grad_year ?? null,
      b.major ?? null,
      b.jp_level ?? null,
      b.rotate_ics ? randomBytes(24).toString("base64url") : null,
    ],
  );
  return { ok: true };
});

/** ?scope=data wipes all business data (PRD: 一键删除全部数据); ?scope=account also deletes the account. */
export const DELETE = withUser(async (req, user) => {
  const scope = new URL(req.url).searchParams.get("scope");
  if (scope === "account") {
    await query(`DELETE FROM users WHERE id = $1`, [user.id]);
    await destroySession();
  } else {
    await query(`DELETE FROM companies WHERE user_id = $1`, [user.id]);
    await query(`DELETE FROM emails WHERE user_id = $1`, [user.id]);
    await query(`DELETE FROM es_docs WHERE user_id = $1`, [user.id]);
  }
  return { ok: true };
});
