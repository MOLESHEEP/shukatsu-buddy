import { z } from "zod";
import { idParam, readJson, withUser } from "@/lib/api";
import { query } from "@/lib/db";
import { assertCompany } from "@/lib/data";
import { localToIso } from "@/lib/time";

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({
  stages: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(40),
        date: z.string().nullable().optional(),
        result: z.enum(["pending", "passed", "failed"]).default("pending"),
      }),
    )
    .max(20),
});

/** Replaces the company's whole stage list (add / remove / reorder / record results in one save). */
export const PUT = withUser<Ctx>(async (req, user, { params }) => {
  const companyId = idParam((await params).id);
  await assertCompany(user.id, companyId);
  const { stages } = await readJson(req, Body);

  await query(`DELETE FROM stages WHERE company_id = $1`, [companyId]);
  for (const [i, s] of stages.entries()) {
    await query(`INSERT INTO stages (company_id, name, date, result, position) VALUES ($1, $2, $3, $4, $5)`, [
      companyId,
      s.name,
      localToIso(s.date),
      s.result,
      i,
    ]);
  }

  // Current stage = first stage not yet passed; a failed stage closes the application.
  const failed = stages.find((s) => s.result === "failed");
  const current = failed ?? stages.find((s) => s.result !== "passed") ?? stages[stages.length - 1];
  const status = failed ? "rejected" : stages.length && stages.every((s) => s.result === "passed") ? "offer" : undefined;
  await query(
    `UPDATE companies SET current_stage = COALESCE($3, current_stage), status = COALESCE($4, CASE WHEN status = 'rejected' THEN 'active' ELSE status END), updated_at = now()
      WHERE id = $1 AND user_id = $2`,
    [companyId, user.id, current?.name ?? null, status ?? null],
  );
  return { ok: true };
});
