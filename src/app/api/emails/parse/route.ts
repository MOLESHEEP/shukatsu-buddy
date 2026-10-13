import { z } from "zod";
import { readJson, withUser } from "@/lib/api";
import { queryOne } from "@/lib/db";
import { parseEmail } from "@/lib/llm/tasks";
import { query } from "@/lib/db";
import { withQuota } from "@/lib/quota";
import { requireAi } from "@/lib/ai-access";

export const maxDuration = 90;

const Body = z.object({ raw: z.string().trim().min(10).max(20000) });

export const POST = withUser(async (req, user) => {
  await requireAi(user);
  const { raw } = await readJson(req, Body);
  const parsed = await withQuota(user, "email", () => parseEmail(raw, user.id));
  const row = await queryOne<{ id: string }>(`INSERT INTO emails (user_id, raw, parsed) VALUES ($1, $2, $3) RETURNING id`, [
    user.id,
    raw,
    JSON.stringify(parsed),
  ]);
  await query(`UPDATE users SET email_used = email_used + 1 WHERE id = $1`, [user.id]);

  // Suggest an existing company card for the confirmation step.
  let match: { id: number; name: string } | null = null;
  if (parsed.company_name) {
    const clean = parsed.company_name.replace(/株式会社|（株）|\(株\)/g, "").trim();
    const c = await queryOne<{ id: string; name: string }>(
      `SELECT id, name FROM companies WHERE user_id = $1 AND (name ILIKE '%' || $2 || '%' OR $3 ILIKE '%' || name || '%') ORDER BY updated_at DESC LIMIT 1`,
      [user.id, clean || parsed.company_name, parsed.company_name],
    );
    if (c) match = { id: Number(c.id), name: c.name };
  }
  return { id: Number(row!.id), parsed, match };
});
