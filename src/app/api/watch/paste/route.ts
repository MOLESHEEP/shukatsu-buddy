import { z } from "zod";
import { readJson, withUser } from "@/lib/api";
import { readPasted } from "@/lib/watch";

const Body = z.object({
  company_name: z.string().trim().min(1, "公司必填").max(100),
  url: z.string().trim().max(500).default(""),
  text: z.string().trim().min(30, "页面内容太短了").max(30_000, "内容太长，请只粘贴和选考相关的部分"),
});

/** Reads pasted page text (JS-rendered pages, PDFs, マイページ notices the fetcher can't open). */
export const POST = withUser(async (req, user) => ({ detectionId: await readPasted(user, await readJson(req, Body)) }));
