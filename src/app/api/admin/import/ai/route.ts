import { z } from "zod";
import { readJson, withAdmin } from "@/lib/api";
import { extractImportPosts } from "@/lib/llm/tasks";
import { sectionsToBody } from "@/lib/community";

export const maxDuration = 300;

const Body = z.object({ text: z.string().trim().min(20, "材料太短").max(60000, "一次最多 6 万字，请分批") });

/** AI splits raw material into post drafts. Nothing is saved here; the admin reviews them first. */
export const POST = withAdmin(async (req, admin) => {
  const { text } = await readJson(req, Body);
  const out = await extractImportPosts(text, admin.id);
  return {
    rows: out.posts.map(({ sections, ...p }) => ({ ...p, body: sectionsToBody(sections) })),
    skipped: out.skipped_zh,
  };
});
