import { z } from "zod";
import { HttpError, readJson, withAdmin } from "@/lib/api";
import { llmAdminView } from "@/lib/admin";
import { getLlmSettings, saveLlmSettings, sealSecret } from "@/lib/settings";
import { PROVIDER_IDS } from "@/lib/llm/providers";
import { listModels, testProvider } from "@/lib/llm/provider";
import { DEFAULT_LIMITS, saveDefaultLimits } from "@/lib/quota";

export const maxDuration = 60;

export const GET = withAdmin(async () => llmAdminView());

const providerId = z.enum(PROVIDER_IDS as [string, ...string[]]);
const limit = z.number().int().min(0).max(1000);

const Put = z.object({
  /** null = follow .env */
  primary: z.union([providerId, z.literal("auto"), z.literal("mock")]).nullable().optional(),
  fallback: z.array(providerId).max(5).nullable().optional(),
  aiDefaultEnabled: z.boolean().optional(),
  limits: z.object({ es: limit, email: limit, post: limit }).optional(),
  providers: z
    .record(
      z.string(),
      z.object({
        /** string = set, null = remove the key saved in the console (fall back to .env), undefined = keep */
        apiKey: z.string().trim().max(500).nullable().optional(),
        model: z.string().trim().max(120).optional(),
        baseUrl: z.string().trim().max(300).optional(),
      }),
    )
    .optional(),
});

export const PUT = withAdmin(async (req) => {
  const b = await readJson(req, Put);
  const s = await getLlmSettings();
  const next = { ...s, providers: { ...s.providers } };
  if (b.primary !== undefined) next.primary = b.primary ?? undefined;
  if (b.fallback !== undefined) next.fallback = b.fallback ?? undefined;
  if (b.aiDefaultEnabled !== undefined) next.aiDefaultEnabled = b.aiDefaultEnabled;
  for (const [id, edit] of Object.entries(b.providers ?? {})) {
    if (!PROVIDER_IDS.includes(id)) throw new HttpError(400, `未知的 AI 服务：${id}`);
    if (edit.baseUrl && !/^https?:\/\//.test(edit.baseUrl)) throw new HttpError(400, "接口地址需以 http:// 或 https:// 开头");
    const cur = { ...(next.providers[id] ?? {}) };
    if (edit.apiKey === null) delete cur.apiKey;
    else if (edit.apiKey) cur.apiKey = sealSecret(edit.apiKey);
    if (edit.model !== undefined) cur.model = edit.model || undefined;
    if (edit.baseUrl !== undefined) cur.baseUrl = edit.baseUrl || undefined;
    next.providers[id] = cur;
  }
  await saveLlmSettings(next);
  if (b.limits) await saveDefaultLimits({ ...DEFAULT_LIMITS, ...b.limits });
  return llmAdminView();
});

const Post = z.object({ action: z.enum(["test", "models"]), provider: providerId });

export const POST = withAdmin(async (req, user) => {
  const { action, provider } = await readJson(req, Post);
  return action === "test" ? testProvider(provider, user.id) : { models: await listModels(provider) };
});
