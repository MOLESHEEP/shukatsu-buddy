import { z } from "zod";

export const TestBody = z.object({
  type: z.enum(["spi", "tamatebako", "tgweb", "gab", "cab", "kraepelin", "custom", "unknown"]),
  format: z.enum(["testcenter", "web", "inhouse", "paper", "unknown"]),
  deadline: z.string().nullable().optional(),
  status: z.enum(["todo", "done", "passed", "failed"]).default("todo"),
  confidence: z.number().nullable().optional(),
});

const month = z.string().regex(/^\d{4}-\d{2}$/, "月份格式应为 YYYY-MM");

/** Metadata + content of a community post. Time labels are required. */
export const PostInput = z
  .object({
    kind: z.enum(["interview", "work"]),
    company_name: z.string().trim().min(1).max(100),
    industry: z.string().trim().max(60).default(""),
    role: z.string().trim().max(60).default(""),
    occurred_on: month,
    ended_on: month.nullable().optional(),
    grad_year: z.number().int().min(2000).max(2100).nullable().optional(),
    stage: z.string().max(40).default(""),
    result: z.enum(["passed", "failed", "pending", "unknown"]).default("unknown"),
    employment_type: z.string().max(40).default(""),
    rating: z.number().int().min(1).max(5).nullable().optional(),
    title: z.string().trim().min(1).max(80),
    body: z.string().trim().min(20, "正文至少 20 字").max(8000),
    tags: z.array(z.string().trim().min(1).max(20)).max(8).default([]),
    anonymous: z.boolean().default(true),
    notes: z.string().max(6000).default(""),
  })
  .refine((p) => !p.ended_on || p.ended_on >= p.occurred_on, { message: "结束时间不能早于开始时间", path: ["ended_on"] });

export const EventBody = z.object({
  kind: z.enum(["deadline", "interview", "briefing", "test", "other"]),
  title: z.string().trim().min(1).max(120),
  starts_at: z.string().min(10),
  location: z.string().max(500).optional(),
  prep: z.string().max(1000).optional(),
});
