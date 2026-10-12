import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { HttpError } from "../api";
import { providerChain, resolveProvider, type ResolvedProvider } from "./providers";

export type Effort = "low" | "medium" | "high";

export type GenerateOptions<T extends z.ZodType> = {
  system: string;
  prompt: string;
  schema: T;
  effort: Effort;
  /** Deterministic sample used in demo mode (no provider configured). */
  mock: () => z.infer<T>;
};

const TIMEOUT_MS = 120_000;

export function isDemoMode() {
  return providerChain().length === 0;
}

export function providerLabel(): string {
  const chain = providerChain();
  if (!chain.length) return "演示模式（未配置 API Key）";
  const [p, ...rest] = chain;
  return `${p.label} · ${p.model ?? "未设置模型"}${rest.length ? `（备用：${rest.map((r) => r.label).join("、")}）` : ""}`;
}

export async function generate<T extends z.ZodType>(opts: GenerateOptions<T>): Promise<z.infer<T>> {
  const chain = providerChain();
  if (!chain.length) {
    await new Promise((r) => setTimeout(r, 600));
    return opts.mock();
  }
  let lastErr: unknown;
  for (const p of chain) {
    try {
      return await generateWith(p, opts);
    } catch (err) {
      lastErr = err;
      // Only fall through to the next provider for failures another vendor could fix.
      if (!(err instanceof HttpError) || ![429, 500, 502, 503, 504].includes(err.status)) throw err;
      console.warn(`[llm] ${p.id} failed (${err.message}); trying next provider`);
    }
  }
  throw lastErr;
}

/** Runs one generation on a specific provider (also used by the settings "测试连接" button). */
export async function generateWith<T extends z.ZodType>(p: ResolvedProvider, opts: Omit<GenerateOptions<T>, "mock">): Promise<z.infer<T>> {
  if (!p.configured) throw new HttpError(500, `${p.label} 配置不完整：${p.missing}`);
  return p.protocol === "anthropic" ? generateAnthropic(p, opts) : generateOpenAICompatible(p, opts);
}

// ---------------- Anthropic (Claude) ----------------

const anthropicClients = new Map<string, Anthropic>();

async function generateAnthropic<T extends z.ZodType>(p: ResolvedProvider, opts: Omit<GenerateOptions<T>, "mock">): Promise<z.infer<T>> {
  const key = `${p.baseUrl}|${p.apiKey}`;
  let client = anthropicClients.get(key);
  if (!client) {
    client = new Anthropic({ apiKey: p.apiKey, baseURL: p.baseUrl, timeout: TIMEOUT_MS });
    anthropicClients.set(key, client);
  }
  const useFallbacks = (process.env.ANTHROPIC_FALLBACKS ?? "default") !== "off";
  try {
    const res = await client.beta.messages.parse({
      model: p.model!,
      max_tokens: 16000,
      system: opts.system,
      messages: [{ role: "user", content: opts.prompt }],
      output_config: { effort: opts.effort, format: betaZodOutputFormat(opts.schema) },
      // Server-side refusal fallback: if a safety classifier declines, the API retries on a fallback model.
      ...(useFallbacks ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    });
    if (res.stop_reason === "refusal") throw new HttpError(422, "AI 拒绝了这次请求，请调整内容后重试");
    if (res.stop_reason === "max_tokens") throw new HttpError(502, "AI 输出过长被截断，请缩短输入后重试");
    if (!res.parsed_output) throw new HttpError(502, "AI 返回格式不正确，请重试");
    return res.parsed_output as z.infer<T>;
  } catch (err) {
    if (err instanceof HttpError) throw err;
    if (err instanceof Anthropic.AuthenticationError) throw new HttpError(500, "Claude API Key 无效");
    if (err instanceof Anthropic.NotFoundError) throw new HttpError(500, `Claude 模型 ${p.model} 不存在，请检查 ANTHROPIC_MODEL`);
    if (err instanceof Anthropic.RateLimitError) throw new HttpError(429, "Claude 请求太频繁，请稍后再试");
    if (err instanceof Anthropic.BadRequestError) throw new HttpError(500, `Claude 请求无效：${err.message.slice(0, 200)}`);
    if (err instanceof Anthropic.APIError) throw new HttpError(502, `Claude 服务错误（${err.status ?? "网络"}）`);
    throw err;
  }
}

// ---------------- OpenAI-compatible (ChatGPT, DeepSeek, Kimi, Qwen, GLM, Gemini, Doubao, Ollama …) ----------------

function jsonSchemaFor(schema: z.ZodType) {
  const { $schema: _drop, ...rest } = z.toJSONSchema(schema) as Record<string, unknown>;
  return rest;
}

type ChatResponse = {
  choices?: { message?: { content?: string | null; refusal?: string | null }; finish_reason?: string }[];
  error?: { message?: string };
};

async function generateOpenAICompatible<T extends z.ZodType>(p: ResolvedProvider, opts: Omit<GenerateOptions<T>, "mock">): Promise<z.infer<T>> {
  const schemaJson = jsonSchemaFor(opts.schema);
  // Every vendor's JSON mode requires the prompt itself to describe the expected JSON.
  const system = `${opts.system}\n\n只输出一个 JSON 对象，不要输出 JSON 以外的任何文字。JSON 必须符合以下 JSON Schema：\n${JSON.stringify(schemaJson)}`;
  const responseFormat =
    p.json === "json_schema"
      ? { type: "json_schema", json_schema: { name: "result", schema: schemaJson, strict: false } }
      : p.json === "json_object"
        ? { type: "json_object" }
        : undefined;

  let lastProblem = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const messages = [
      { role: "system", content: system },
      { role: "user", content: opts.prompt },
      ...(attempt > 0 ? [{ role: "user", content: `上一次的输出不符合要求（${lastProblem}）。请只输出符合 schema 的 JSON 对象。` }] : []),
    ];
    let res: Response;
    try {
      res = await fetch(`${p.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(p.apiKey ? { authorization: `Bearer ${p.apiKey}` } : {}) },
        body: JSON.stringify({ model: p.model, messages, ...(responseFormat ? { response_format: responseFormat } : {}) }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      const timeout = err instanceof Error && err.name === "TimeoutError";
      throw new HttpError(504, `${p.label} ${timeout ? "响应超时" : "无法连接"}（${p.baseUrl}）`);
    }

    const data = (await res.json().catch(() => ({}))) as ChatResponse;
    if (!res.ok) throw httpErrorFor(p, res.status, data.error?.message);

    const choice = data.choices?.[0];
    if (choice?.message?.refusal) throw new HttpError(422, `${p.label} 拒绝了这次请求`);
    if (choice?.finish_reason === "length") throw new HttpError(502, `${p.label} 输出过长被截断，请缩短输入后重试`);
    const text = choice?.message?.content ?? "";
    try {
      return opts.schema.parse(JSON.parse(extractJson(text)));
    } catch (e) {
      lastProblem = e instanceof z.ZodError ? e.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") : "不是合法 JSON";
    }
  }
  throw new HttpError(502, `${p.label} 返回格式不正确，请重试或换一个模型`);
}

function httpErrorFor(p: ResolvedProvider, status: number, message = "") {
  const detail = message ? `：${message.slice(0, 200)}` : "";
  if (status === 401 || status === 403) return new HttpError(500, `${p.label} API Key 无效或无权限${detail}`);
  if (status === 404 || /model.*(not.*exist|not found|does not exist)|invalid model/i.test(message))
    return new HttpError(500, `${p.label} 找不到模型 ${p.model}，请在「设置 → AI 引擎」查看可用模型${detail}`);
  if (status === 402) return new HttpError(500, `${p.label} 账户余额不足${detail}`);
  if (status === 429) return new HttpError(429, `${p.label} 请求太频繁或额度用完，请稍后再试`);
  if (status >= 500) return new HttpError(502, `${p.label} 服务暂时不可用（${status}）`);
  return new HttpError(500, `${p.label} 请求失败（${status}）${detail}`);
}

/** Pulls the JSON object out of replies that wrap it in prose, code fences or <think> blocks. */
export function extractJson(text: string) {
  let t = text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) t = fenced[1].trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  return start >= 0 && end > start ? t.slice(start, end + 1) : t;
}

// ---------------- Diagnostics for the settings page ----------------

const PingSchema = z.object({ ok: z.boolean(), reply_ja: z.string() });

export async function testProvider(id: string) {
  const p = resolveProvider(id);
  if (!p) throw new HttpError(404, "未知的 AI 服务");
  const started = Date.now();
  const out = await generateWith(p, {
    system: "你是连接测试助手。",
    prompt: '请返回 {"ok": true, "reply_ja": "<用一句日语打招呼>"}',
    schema: PingSchema,
    effort: "low",
  });
  return { provider: p.id, model: p.model, ms: Date.now() - started, reply: out.reply_ja };
}

/** GET /models on OpenAI-compatible providers (and Anthropic), so stale default model names are easy to fix. */
export async function listModels(id: string): Promise<string[]> {
  const p = resolveProvider(id);
  if (!p) throw new HttpError(404, "未知的 AI 服务");
  if (p.needsKey && !p.apiKey) throw new HttpError(400, `未设置 ${p.keyEnvs[0]}`);
  if (!p.baseUrl) throw new HttpError(400, `未设置 ${p.id.toUpperCase()}_BASE_URL`);
  const url = p.protocol === "anthropic" ? `${p.baseUrl}/v1/models?limit=100` : `${p.baseUrl}/models`;
  const headers: Record<string, string> =
    p.protocol === "anthropic" ? { "x-api-key": p.apiKey!, "anthropic-version": "2023-06-01" } : p.apiKey ? { authorization: `Bearer ${p.apiKey}` } : {};
  let res: Response;
  try {
    res = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
  } catch {
    throw new HttpError(504, `无法连接 ${p.label}（${p.baseUrl}）`);
  }
  const data = (await res.json().catch(() => ({}))) as { data?: { id?: string; name?: string }[]; models?: { name?: string }[]; error?: { message?: string } };
  if (!res.ok) throw httpErrorFor(p, res.status, data.error?.message);
  const entries: { id?: string; name?: string }[] = data.data ?? data.models ?? [];
  const ids = entries.map((m) => (m.id || m.name || "").replace(/^models\//, "")).filter(Boolean);
  return [...new Set(ids)].sort();
}
