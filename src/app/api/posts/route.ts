import { readJson, withUser } from "@/lib/api";
import { queryOne } from "@/lib/db";
import { PostInput } from "@/lib/validators";

/** Creates a post as a DRAFT. Publishing is a separate, explicitly confirmed step (PATCH ?publish). */
export const POST = withUser(async (req, user) => {
  const p = await readJson(req, PostInput);
  const row = await queryOne<{ id: string }>(
    `INSERT INTO posts (user_id, kind, status, company_name, industry, role, occurred_on, ended_on, grad_year, stage, result,
                        employment_type, rating, title, body, tags, anonymous, notes)
     VALUES ($1, $2, 'draft', $3, $4, $5, ($6::text || '-01')::date, ($7::text || '-01')::date, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
     RETURNING id`,
    [
      user.id,
      p.kind,
      p.company_name,
      p.industry,
      p.role,
      p.occurred_on,
      p.kind === "work" ? (p.ended_on ?? null) : null,
      p.grad_year ?? null,
      p.stage,
      p.result,
      p.employment_type,
      p.rating ?? null,
      p.title,
      p.body,
      p.tags,
      p.anonymous,
      p.notes,
    ],
  );
  return { id: Number(row!.id) };
});
