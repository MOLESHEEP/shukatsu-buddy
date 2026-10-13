import { z } from "zod";
import { readJson, withUser } from "@/lib/api";
import { draftReply } from "@/lib/llm/tasks";
import { REPLY_SCENARIOS } from "@/lib/constants";
import { withQuota } from "@/lib/quota";
import { requireAi } from "@/lib/ai-access";

export const maxDuration = 90;

const Body = z.object({
  scenario: z.enum(Object.keys(REPLY_SCENARIOS) as [string, ...string[]]),
  company: z.string().max(100).default(""),
  contact: z.string().max(60).optional(),
  original: z.string().max(10000).optional(),
  details: z.string().max(2000).optional(),
  name: z.string().max(60).optional(),
  school: z.string().max(100).optional(),
});

/** Reply drafts share the 邮件助手 daily limit with email parsing. */
export const POST = withUser(async (req, user) => {
  await requireAi(user);
  const b = await readJson(req, Body);
  return withQuota(user, "email", () => draftReply({ ...b, name: b.name || user.display_name }, user.id));
});
