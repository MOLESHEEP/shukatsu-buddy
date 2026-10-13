import { z } from "zod";
import { readJson, withUser } from "@/lib/api";
import { query } from "@/lib/db";
import { pointSummary, redeem } from "@/lib/points";

export const GET = withUser(async (_req, user) => pointSummary(user.id));

/** Preferences: whether to spend points automatically once today's free AI uses run out. */
export const PATCH = withUser(async (req, user) => {
  const { autoAi } = await readJson(req, z.object({ autoAi: z.boolean() }));
  await query(`UPDATE users SET points_auto_ai = $2 WHERE id = $1`, [user.id, autoAi]);
  return { autoAi };
});

/** Point Market: exchange points for an item. */
export const POST = withUser(async (req, user) => {
  const { item } = await readJson(req, z.object({ item: z.string().max(60) }));
  return redeem(user, item);
});
