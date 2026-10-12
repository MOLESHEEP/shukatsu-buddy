import { z } from "zod";

export const TestBody = z.object({
  type: z.enum(["spi", "tamatebako", "tgweb", "gab", "cab", "kraepelin", "custom", "unknown"]),
  format: z.enum(["testcenter", "web", "inhouse", "paper", "unknown"]),
  deadline: z.string().nullable().optional(),
  status: z.enum(["todo", "done", "passed", "failed"]).default("todo"),
  confidence: z.number().nullable().optional(),
});

export const EventBody = z.object({
  kind: z.enum(["deadline", "interview", "briefing", "test", "other"]),
  title: z.string().trim().min(1).max(120),
  starts_at: z.string().min(10),
  location: z.string().max(500).optional(),
  prep: z.string().max(1000).optional(),
});
