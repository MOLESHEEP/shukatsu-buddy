import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { HttpError } from "../api";

export type Effort = "low" | "medium" | "high";

export type GenerateOptions<T extends z.ZodType> = {
  system: string;
  prompt: string;
  schema: T;
  effort: Effort;
  /** Deterministic sample used in demo mode (no API key configured). */
  mock: () => z.infer<T>;
};

export type ProviderName = "anthropic" | "openai" | "mock";

export function activeProvider(): ProviderName {
  const p = (process.env.LLM_PROVIDER ?? "auto").toLowerCase();
  if (p === "anthropic" || p === "openai" || p === "mock") return p;
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.OPENAI_API_KEY) return "openai";
  return "mock";
}

export function providerLabel(): string {
  const p = activeProvider();
  if (p === "anthropic") return `Claude · ${process.env.ANTHROPIC_MODEL || "claude-opus-5-5"}`;
  if (p === "openai") return `OpenAI 兼容 · ${process.env.OPENAI_MODEL || "unknown"}`;
  return "演示模式（未配置 API Key）";
}

export async function generate<T extends z.ZodType>(opts: GenerateOptions<T>): Promise<z.infer<T>> {
  const provider = activeProvider();
  if (provider === "mock") {
    await new Promise((r) => setTimeout(r, 600));
    return opts.mock();
  }
  return provider === "anthropic" ? generateAnthropic(opts) : generateOpenAI(opts);
}

// ---------------- Anthropic (Claude) ----------------

let anthropic: Anthropic | null = null;

async function generateAnthropic<T extends z.ZodType>(opts: GenerateOptions<T>): Promise<z.infer<T>> {
  anthropic ??= new Anthropic();
  const useFallbacks = (process.env.ANTHROPIC_FALLBACKS ?? "default") !== "off";
  try {
    const res = await anthropic.beta.messages.parse({
      model: process.env.ANTHROPIC_MODEL || "claude-opus-5-5",
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
    if (err instanceof Anthropic.AuthenticationError) throw new HttpError(500, "Anthropic API Key 无效");
    if (err instanceof Anthropic.RateLimitError) throw new HttpError(429, "AI 请求太频繁，请稍后再试");
    if (err instanceof Anthropic.APIError) throw new HttpError(502, `AI 服务错误（${err.status ?? "network"}）`);
    throw err;
  }
}

// ---------------- OpenAI-compatible (DeepSeek, Qwen, Ollama, ...) ----------------

async function generateOpenAI<T extends z.ZodType>(opts: GenerateOptions<T>): Promise<z.infer<T>> {
  const base = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const jsonSchema = JSON.stringify(z.toJSONSchema(opts.schema));
  const system = `${opts.system}\n\n只输出一个 JSON 对象，不要输出其他文字。JSON 必须符合以下 JSON Schema：\n${jsonSchema}`;

  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${process.env.OPENAI_API_KEY ?? ""}` },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: attempt === 0 ? opts.prompt : `${opts.prompt}\n\n（上次输出不符合格式：${lastError}。请严格按 schema 输出 JSON。）` },
        ],
      }),
    });
    if (!res.ok) throw new HttpError(502, `AI 服务错误（${res.status}）`);
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = data.choices?.[0]?.message?.content ?? "";
    try {
      return opts.schema.parse(JSON.parse(stripFences(text)));
    } catch (e) {
      lastError = e instanceof Error ? e.message.slice(0, 300) : "invalid JSON";
    }
  }
  throw new HttpError(502, "AI 返回格式不正确，请重试");
}

function stripFences(text: string) {
  const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (m ? m[1] : text).trim();
}
