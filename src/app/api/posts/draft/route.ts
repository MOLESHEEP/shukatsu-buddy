import { z } from "zod";
import { readJson, withUser } from "@/lib/api";
import { draftPost } from "@/lib/llm/tasks";
import { sectionsToBody, timeLabel } from "@/lib/community";

export const maxDuration = 120;

const Body = z.object({
  kind: z.enum(["interview", "work"]),
  company_name: z.string().trim().min(1).max(100),
  role: z.string().max(60).optional(),
  occurred_on: z.string().regex(/^\d{4}-\d{2}$/),
  ended_on: z.string().regex(/^\d{4}-\d{2}$/).nullable().optional(),
  grad_year: z.number().int().nullable().optional(),
  stage: z.string().max(40).optional(),
  result: z.string().max(20).optional(),
  employment_type: z.string().max(40).optional(),
  notes: z.string().trim().min(15, "请再多描述一些（至少 15 字）").max(6000),
});

/** AI turns the user's rough description into an editable draft. Nothing is saved or published here. */
export const POST = withUser(async (req) => {
  const b = await readJson(req, Body);
  const extra =
    b.kind === "interview"
      ? [b.stage && `阶段：${b.stage}`, b.result && b.result !== "unknown" && `结果：${{ passed: "通过", failed: "未通过", pending: "等待结果" }[b.result] ?? b.result}`]
      : [b.employment_type && `雇佣形式：${b.employment_type}`];
  const draft = await draftPost({
    kind: b.kind,
    company: b.company_name,
    role: b.role,
    timeLabel: timeLabel({ kind: b.kind, occurred_on: b.occurred_on, ended_on: b.ended_on ?? null, grad_year: b.grad_year ?? null }),
    extra: extra.filter(Boolean).join("；"),
    notes: b.notes,
  });
  return { ...draft, body: sectionsToBody(draft.sections) };
});
