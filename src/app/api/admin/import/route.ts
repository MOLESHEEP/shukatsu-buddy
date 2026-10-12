import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { HttpError, readJson, withAdmin } from "@/lib/api";
import { transaction } from "@/lib/db";
import { PostInput } from "@/lib/validators";
import { importCommitSchema, validateRow, type PostDraftRow } from "@/lib/import";

/**
 * Imports reviewed rows as posts owned by the admin, in one transaction.
 * Every row is validated again on the server; publishing requires explicit confirmation.
 */
export const POST = withAdmin(async (req, admin) => {
  const b = await readJson(req, importCommitSchema);
  if (b.publish && b.confirmed !== true) throw new HttpError(400, "直接发布前请勾选确认");

  const problems = b.rows
    .map((row, index) => ({ index, errors: validateRow(row as PostDraftRow) }))
    .filter((p) => p.errors.length);
  if (problems.length) {
    return NextResponse.json({ error: `有 ${problems.length} 行未通过校验，请修正后再导入`, problems }, { status: 400 });
  }
  const rows = b.rows.map((r) => PostInput.parse({ ...(r as object), notes: "" }));

  const batchId = `${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${randomBytes(3).toString("hex")}`;
  await transaction(async (q) => {
    await q(`INSERT INTO import_batches (id, admin_id, label, method, count, published) VALUES ($1, $2, $3, $4, $5, $6)`, [
      batchId,
      admin.id,
      b.batchLabel,
      b.method,
      rows.length,
      b.publish,
    ]);
    for (const p of rows) {
      await q(
        `INSERT INTO posts (user_id, kind, status, company_name, industry, role, occurred_on, ended_on, grad_year, stage, result,
                            employment_type, rating, title, body, tags, anonymous, source, import_batch, published_at)
         VALUES ($1, $2, $3, $4, $5, $6, ($7::text || '-01')::date, ($8::text || '-01')::date, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19,
                 CASE WHEN $3::text = 'published' THEN now() END)`,
        [
          admin.id,
          p.kind,
          b.publish ? "published" : "draft",
          p.company_name,
          p.industry,
          p.role,
          p.occurred_on,
          p.kind === "work" ? (p.ended_on ?? null) : null,
          p.kind === "interview" ? (p.grad_year ?? null) : null,
          p.stage,
          p.result,
          p.employment_type,
          p.kind === "work" ? (p.rating ?? null) : null,
          p.title,
          p.body,
          p.tags,
          p.anonymous,
          p.source,
          batchId,
        ],
      );
    }
  });
  return { batchId, count: rows.length };
});
