import { z } from "zod";
import { readJson, withUser } from "@/lib/api";
import { queryOne } from "@/lib/db";

const Body = z.object({
  company_id: z.number().int().nullable().optional(),
  company_name: z.string().max(100).default(""),
  question: z.string().trim().min(1).max(500),
  char_limit: z.number().int().positive().max(5000).nullable().optional(),
  text: z.string().trim().min(1).max(6000),
  is_material: z.boolean().default(false),
  material_tag: z.string().max(20).default(""),
});

/** Saves an ES written by the user without AI. Available to everyone, not counted toward any limit. */
export const POST = withUser(async (req, user) => {
  const b = await readJson(req, Body);
  let companyName = b.company_name;
  if (b.company_id) {
    const c = await queryOne<{ name: string }>(`SELECT name FROM companies WHERE id = $1 AND user_id = $2`, [b.company_id, user.id]);
    companyName = c?.name ?? companyName;
  }
  const doc = await queryOne<{ id: number }>(
    `INSERT INTO es_docs (user_id, company_id, company_name, question, char_limit, draft, rewritten, review, is_material, material_tag)
     VALUES ($1, $2, $3, $4, $5, $6, $6, NULL, $7, $8) RETURNING id`,
    [user.id, b.company_id ?? null, companyName, b.question, b.char_limit ?? null, b.text, b.is_material, b.material_tag],
  );
  return { id: doc!.id };
});
