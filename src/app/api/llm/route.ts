import { z } from "zod";
import { HttpError, readJson, withUser } from "@/lib/api";
import { listModels, testProvider } from "@/lib/llm/provider";
import { PROVIDER_IDS } from "@/lib/llm/providers";

export const maxDuration = 60;

/** GET ?models=<provider> lists the live model ids of a provider. */
export const GET = withUser(async (req) => {
  const id = new URL(req.url).searchParams.get("models");
  if (!id || !PROVIDER_IDS.includes(id)) throw new HttpError(400, "请指定 AI 服务");
  return { models: await listModels(id) };
});

/** POST {provider} runs a tiny structured-output request to verify key, model and JSON mode. */
export const POST = withUser(async (req) => {
  const { provider } = await readJson(req, z.object({ provider: z.enum(PROVIDER_IDS as [string, ...string[]]) }));
  return testProvider(provider);
});
