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

export const PostDraftSchema = z.object({
  title: z.string().describe("一句话标题，30 字以内"),
  sections: z
    .array(z.object({ heading: z.string(), content: z.string() }))
    .describe("按模板组织的小节；用户没提到的小节不要编造，直接省略"),
  tags: z.array(z.string()).describe("3–6 个短标签"),
  questions_zh: z.array(z.string()).describe("补充后会更有参考价值的信息，0–4 条，以提问形式"),
  privacy_warnings_zh: z.array(z.string()).describe("可能暴露个人或公司机密的内容，0–3 条"),
});
export type PostDraft = z.infer<typeof PostDraftSchema>;

export const POST_VIOLATIONS = ["not_experience", "political", "sexual", "violence", "marketing", "defamation", "personal_attack", "privacy"] as const;

export const PostReviewSchema = z.object({
  decision: z.enum(["approve", "reject", "unsure"]).describe("approve = 可以发布；reject = 明确违反规则；unsure = 拿不准，交给人工"),
  violations: z.array(z.enum(POST_VIOLATIONS)).describe("命中的规则，没有则为空数组"),
  reason_zh: z.string().describe("给作者看的一两句中文说明：驳回时说明哪里有问题、怎么改；通过时简短说明即可"),
});
export type PostReview = z.infer<typeof PostReviewSchema>;

export const ImportExtractSchema = z.object({
  posts: z.array(
    z.object({
      kind: z.enum(["interview", "work"]),
      company_name: z.string(),
      industry: z.string(),
      role: z.string(),
      occurred_on: z.string().describe("YYYY-MM；原文没有明确到月份时填空字符串"),
      ended_on: z.string().nullable().describe("工作体验的离职月份 YYYY-MM；仍在职或未提及填 null"),
      grad_year: z.number().int().nullable().describe("面试时作者的毕业年份，如 2028；未提及填 null"),
      stage: z.string(),
      result: z.enum(["passed", "failed", "pending", "unknown"]),
      employment_type: z.string(),
      rating: z.number().int().nullable().describe("1–5，原文有明确评价时才填"),
      title: z.string(),
      sections: z.array(z.object({ heading: z.string(), content: z.string() })),
      tags: z.array(z.string()),
    }),
  ),
  skipped_zh: z.array(z.string()).describe("无法整理成经验分享的片段及原因"),
});
export type ImportExtract = z.infer<typeof ImportExtractSchema>;

export const ReplySchema = z.object({
  subject: z.string(),
  body: z.string(),
  notes_zh: z.array(z.string()),
});
export type ReplyDraft = z.infer<typeof ReplySchema>;

/** Reading of a company 采用 page: is 本选考 open, which round, and the dates. */
export const WatchExtractSchema = z.object({
  company_name: z.string().nullable(),
  is_selection_page: z.boolean().describe("页面是否包含新卒本选考 / エントリー相关信息"),
  phase: z.enum(["open", "upcoming", "closed", "unknown"]).describe("本选考エントリー：open=受付中 upcoming=已公布但未开始 closed=已截止"),
  grad_year: z.number().int().nullable().describe("对象届，如 2028年卒 → 2028"),
  round_no: z.number().int().nullable().describe("第几次选考 / 第几回締切，如 第2回 → 2；只有一次或没写时为 null"),
  round_label: z.string().describe("页面原文里的叫法，如「本選考 第2回締切」「二次募集」；没有时为空字符串"),
  entry_url: z.string().nullable().describe("エントリー / マイページ 链接（页面中出现的完整 URL）"),
  items: z.array(
    z.object({
      kind: z.enum(["entry_open", "deadline", "briefing", "test", "interview", "other"]),
      title_zh: z.string().describe("简短中文说明，如「ES 提交截止」"),
      start_local: z.string().describe("YYYY-MM-DDTHH:mm，日本时间；只有日期时：开放类用 00:00，截止类用 23:59"),
      location: z.string().nullable(),
    }),
  ),
  summary_zh: z.string().describe("一两句中文总结"),
  evidence_ja: z.array(z.string()).describe("支撑判断的页面原文片段（原样摘录，最多 5 条）"),
  confidence: z.number().describe("0 到 1"),
  uncertain_points_zh: z.array(z.string()),
});
export type WatchExtract = z.infer<typeof WatchExtractSchema>;
