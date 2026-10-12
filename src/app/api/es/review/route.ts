import { z } from "zod";
import { readJson, withUser } from "@/lib/api";
import { query, queryOne } from "@/lib/db";
import { countChars, reviewEs } from "@/lib/llm/tasks";
import { checkQuota } from "@/lib/quota";
import { requireAi } from "@/lib/ai-access";

export const maxDuration = 120;

const Body = z.object({
  company_id: z.number().int().nullable().optional(),
  company_name: z.string().max(100).default(""),
  question: z.string().trim().min(1).max(500),
  char_limit: z.number().int().positive().max(5000).nullable().optional(),
  draft: z.string().trim().min(10).max(6000),
});

export const POST = withUser(async (req, user) => {
  await requireAi(user);
  await checkQuota(user, "es");
  const b = await readJson(req, Body);

  let companyName = b.company_name;
  let companyNotes = "";
  if (b.company_id) {
    const c = await queryOne<{ name: string; industry: string; notes: string }>(
      `SELECT name, industry, notes FROM companies WHERE id = $1 AND user_id = $2`,
      [b.company_id, user.id],
    );
    if (c) {
      companyName = c.name;
      companyNotes = [c.industry && `行业：${c.industry}`, c.notes].filter(Boolean).join("；");
    }
  }

  const limit = b.char_limit ?? null;
  const input = { company: companyName, question: b.question, charLimit: limit, draft: b.draft, companyNotes, profile: user };
  let review = await reviewEs(input, user.id);
  let count = countChars(review.rewritten);
  // The model occasionally overshoots the limit; one tightening pass (not counted toward the daily limit) usually fixes it.
  if (limit && count > limit) {
    review = await reviewEs({ ...input, tighten: { previous: review.rewritten, count } }, user.id);
    count = countChars(review.rewritten);
  }

  const doc = await queryOne<{ id: number }>(
    `INSERT INTO es_docs (user_id, company_id, company_name, question, char_limit, draft, rewritten, review)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [user.id, b.company_id ?? null, companyName, b.question, limit, b.draft, review.rewritten, JSON.stringify(review)],
  );
  await query(`UPDATE users SET es_used = es_used + 1 WHERE id = $1`, [user.id]);
  return { id: doc!.id, review, count, limit, over: !!limit && count > limit };
});

export const GET = withUser(async (_req, user) => {
  const docs = await query(
    `SELECT id, company_id, company_name, question, char_limit, draft, rewritten, is_material, material_tag, created_at
       FROM es_docs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 200`,
    [user.id],
  );
  return { docs };
});
