import { randomBytes } from "node:crypto";
import { z } from "zod";
import { readJson, withUser } from "@/lib/api";
import { query } from "@/lib/db";
import { destroySession } from "@/lib/auth";

const Patch = z.object({
  display_name: z.string().trim().max(40).optional(),
  // Any cohort: current students, future 届, and members who graduated years ago.
  grad_year: z.number().int().min(1980).max(2100).nullable().optional(),
  major: z.string().max(60).optional(),
  jp_level: z.string().max(40).optional(),
  career_stage: z.enum(["student", "working"]).optional(),
  rotate_ics: z.boolean().optional(),
});

export const PATCH = withUser(async (req, user) => {
  const b = await readJson(req, Patch);
  await query(
    `UPDATE users SET display_name = COALESCE($2, display_name), grad_year = CASE WHEN $3::boolean THEN $4::int ELSE grad_year END,
            major = COALESCE($5, major), jp_level = COALESCE($6, jp_level), ics_token = COALESCE($7, ics_token),
            career_stage = COALESCE($8, career_stage)
      WHERE id = $1`,
    [
      user.id,
      b.display_name ?? null,
      "grad_year" in b,
      b.grad_year ?? null,
      b.major ?? null,
      b.jp_level ?? null,
      b.rotate_ics ? randomBytes(24).toString("base64url") : null,
      b.career_stage ?? null,
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
    await query(`DELETE FROM posts WHERE user_id = $1`, [user.id]);
    await query(`DELETE FROM post_votes WHERE user_id = $1`, [user.id]);
    await query(`DELETE FROM opening_follows WHERE user_id = $1`, [user.id]);
    await query(`DELETE FROM opening_reports WHERE user_id = $1`, [user.id]);
    // Published 选考 records stay (others rely on them) but no longer point to this user.
    await query(`UPDATE openings SET reporter_id = NULL, anonymous = true WHERE reporter_id = $1`, [user.id]);
    // 网页监控: personal pages / readings go; the admin pool belongs to the site and stays.
    await query(`DELETE FROM watch_detections WHERE owner_id = $1 AND scope = 'personal'`, [user.id]);
    await query(`DELETE FROM watch_pages WHERE owner_id = $1 AND scope = 'personal'`, [user.id]);
    await query(`DELETE FROM official_tracks WHERE user_id = $1`, [user.id]);
  }
  return { ok: true };
});
