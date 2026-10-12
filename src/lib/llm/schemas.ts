import { z } from "zod";

// Schemas are kept to features every structured-output backend supports
// (no min/max, no regex): the server enforces numeric ranges itself.

const scoreItem = z.object({
  score: z.number().int().describe("1–5"),
  comment_zh: z.string(),
});

export const EsReviewSchema = z.object({
  rewritten: z.string().describe("日文改写稿，必须在字数上限以内"),
  summary_zh: z.string().describe("一两句中文总评"),
  notes: z
    .array(
      z.object({
        original: z.string().describe("原稿中的句子（原文照抄）"),
        revised: z.string().describe("改写后的日文"),
        issue_zh: z.string().describe("哪里不自然、为什么"),
        hr_view_zh: z.string().describe("日本人事读到原句时会怎么理解"),
      }),
    )
    .describe("逐句修改说明"),
  scores: z.object({
    conclusion_first: scoreItem,
    specificity: scoreItem,
    company_fit: scoreItem,
  }),
  next_steps_zh: z.array(z.string()).describe("用户自己还能改进的 1–3 点"),
});
export type EsReview = z.infer<typeof EsReviewSchema>;

export const EmailParseSchema = z.object({
  company_name: z.string().nullable(),
  category: z.enum(["interview", "briefing", "es", "test", "offer", "rejection", "schedule_request", "other"]),
  summary_zh: z.string(),
  events: z.array(
    z.object({
      kind: z.enum(["deadline", "interview", "briefing", "test", "other"]),
      title_zh: z.string(),
      start_local: z.string().describe("YYYY-MM-DDTHH:mm，日本时间；只有日期时用 23:59"),
      location_or_url: z.string().nullable(),
      prep_zh: z.string().nullable().describe("需要准备的事项"),
    }),
  ),
  required_materials: z.array(z.string()),
  reply_deadline_local: z.string().nullable().describe("YYYY-MM-DDTHH:mm 或 null"),
  needs_reply: z.boolean(),
  test: z
    .object({
      type: z.enum(["spi", "tamatebako", "tgweb", "gab", "cab", "kraepelin", "custom", "unknown"]),
      format: z.enum(["testcenter", "web", "inhouse", "paper", "unknown"]),
      deadline_local: z.string().nullable(),
      confidence: z.number().describe("0 到 1"),
      reason_zh: z.string().describe("依据哪些措辞或链接判断"),
    })
    .nullable(),
  uncertain_points_zh: z.array(z.string()),
});
export type EmailParse = z.infer<typeof EmailParseSchema>;

export const ReplySchema = z.object({
  subject: z.string(),
  body: z.string(),
  notes_zh: z.array(z.string()),
});
export type ReplyDraft = z.infer<typeof ReplySchema>;
