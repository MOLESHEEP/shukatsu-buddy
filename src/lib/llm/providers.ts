import "server-only";

/**
 * LLM provider registry.
 *
 * Every provider is configured with environment variables named after its id:
 *   <ID>_API_KEY, <ID>_MODEL, <ID>_BASE_URL   (e.g. DEEPSEEK_API_KEY, DEEPSEEK_MODEL)
 * plus the vendor's own customary key names as aliases (MOONSHOT_API_KEY, DASHSCOPE_API_KEY …).
 *
 * Claude goes through the official Anthropic SDK; all others speak the OpenAI Chat Completions protocol.
 * Default models were checked against each vendor's docs in Oct 2026 — vendors rename models often,
 * so every default can be overridden with <ID>_MODEL, and Settings → AI 引擎 can list the live models.
 */

export type JsonMode = "json_schema" | "json_object" | "none";

export type ProviderPreset = {
  id: string;
  label: string;
  vendor: string;
  protocol: "anthropic" | "openai";
  keyEnvs: string[]; // first is canonical
  defaultBaseUrl: string;
  /** null = the user must set <ID>_MODEL (e.g. Doubao endpoint ids) */
  defaultModel: string | null;
  json: JsonMode;
  needsKey: boolean;
  consoleUrl: string;
  note?: string;
};

export const PROVIDERS: ProviderPreset[] = [
  {
    id: "anthropic",
    label: "Claude",
    vendor: "Anthropic",
    protocol: "anthropic",
    keyEnvs: ["ANTHROPIC_API_KEY"],
    defaultBaseUrl: "https://api.anthropic.com",
    defaultModel: "claude-opus-5-5",
    json: "json_schema",
    needsKey: true,
    consoleUrl: "https://console.anthropic.com/",
  },
  {
    id: "openai",
    label: "ChatGPT",
    vendor: "OpenAI",
    protocol: "openai",
    keyEnvs: ["OPENAI_API_KEY"],
    defaultBaseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-6.1-sol",
    json: "json_schema",
    needsKey: true,
    consoleUrl: "https://platform.openai.com/api-keys",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    vendor: "深度求索",
    protocol: "openai",
    keyEnvs: ["DEEPSEEK_API_KEY"],
    defaultBaseUrl: "https://api.deepseek.com",
    defaultModel: "deepseek-flash",
    json: "json_object",
    needsKey: true,
    consoleUrl: "https://platform.deepseek.com/api_keys",
  },
  {
    id: "kimi",
    label: "Kimi",
    vendor: "Moonshot AI 月之暗面",
    protocol: "openai",
    keyEnvs: ["KIMI_API_KEY", "MOONSHOT_API_KEY"],
    defaultBaseUrl: "https://api.moonshot.ai/v1",
    defaultModel: "kimi-k3",
    json: "json_object",
    needsKey: true,
    consoleUrl: "https://platform.kimi.ai/",
    note: "国内账号的 Key 请设置 KIMI_BASE_URL=https://api.moonshot.cn/v1",
  },
  {
    id: "qwen",
    label: "通义千问 Qwen",
    vendor: "阿里云百炼",
    protocol: "openai",
    keyEnvs: ["QWEN_API_KEY", "DASHSCOPE_API_KEY"],
    defaultBaseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    defaultModel: "qwen-plus",
    json: "json_object",
    needsKey: true,
    consoleUrl: "https://bailian.console.aliyun.com/",
    note: "Key 按地域发放；新加坡 / 东京等地域请把 QWEN_BASE_URL 改成控制台显示的地址",
  },
  {
    id: "glm",
    label: "智谱 GLM",
    vendor: "智谱 AI",
    protocol: "openai",
    keyEnvs: ["GLM_API_KEY", "ZHIPU_API_KEY", "ZHIPUAI_API_KEY"],
    defaultBaseUrl: "https://open.bigmodel.cn/api/paas/v4",
    defaultModel: "glm-5.3",
    json: "json_object",
    needsKey: true,
    consoleUrl: "https://open.bigmodel.cn/usercenter/apikeys",
  },
  {
    id: "gemini",
    label: "Gemini",
    vendor: "Google",
    protocol: "openai",
    keyEnvs: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultModel: "gemini-3.8-flash",
    json: "json_schema",
    needsKey: true,
    consoleUrl: "https://aistudio.google.com/apikey",
  },
  {
    id: "doubao",
    label: "豆包 Doubao",
    vendor: "字节跳动 火山方舟",
    protocol: "openai",
    keyEnvs: ["DOUBAO_API_KEY", "ARK_API_KEY"],
    defaultBaseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    defaultModel: null,
    json: "json_object",
    needsKey: true,
    consoleUrl: "https://console.volcengine.com/ark",
    note: "需要设置 DOUBAO_MODEL 为方舟控制台中的模型 ID 或推理接入点 ID（ep-…）",
  },
  {
    id: "ollama",
    label: "Ollama（本地模型）",
    vendor: "自托管",
    protocol: "openai",
    keyEnvs: ["OLLAMA_API_KEY"],
    defaultBaseUrl: "http://host.docker.internal:11434/v1",
    defaultModel: null,
    json: "json_object",
    needsKey: false,
    consoleUrl: "https://ollama.com/library",
    note: "设置 OLLAMA_MODEL（如 qwen3:14b）即启用；建议 14B 以上模型以保证日文质量",
  },
  {
    id: "custom",
    label: "自定义（OpenAI 兼容）",
    vendor: "任意兼容服务",
    protocol: "openai",
    keyEnvs: ["CUSTOM_API_KEY"],
    defaultBaseUrl: "",
    defaultModel: null,
    json: "json_object",
    needsKey: false,
    consoleUrl: "",
    note: "OpenRouter、SiliconFlow、vLLM、LM Studio… 设置 CUSTOM_BASE_URL 和 CUSTOM_MODEL；CUSTOM_JSON_MODE 可选 json_schema / json_object / none",
  },
];

export const PROVIDER_IDS = PROVIDERS.map((p) => p.id);

/** Old configs used LLM_PROVIDER=openai + OPENAI_BASE_URL for any compatible vendor; that still works. */
function env(name: string) {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

export type ResolvedProvider = ProviderPreset & {
  apiKey: string | undefined;
  baseUrl: string;
  model: string | null;
  json: JsonMode;
  configured: boolean;
  /** Why it is not usable, for the settings page. */
  missing: string | null;
};

export function resolveProvider(id: string): ResolvedProvider | null {
  const p = PROVIDERS.find((x) => x.id === id);
  if (!p) return null;
  const ID = p.id.toUpperCase();
  const apiKey = p.keyEnvs.map(env).find(Boolean);
  const baseUrl = (env(`${ID}_BASE_URL`) ?? p.defaultBaseUrl).replace(/\/+$/, "");
  const model = env(`${ID}_MODEL`) ?? p.defaultModel;
  const jsonEnv = env(`${ID}_JSON_MODE`) as JsonMode | undefined;
  const json = jsonEnv && ["json_schema", "json_object", "none"].includes(jsonEnv) ? jsonEnv : p.json;

  let missing: string | null = null;
  if (p.needsKey && !apiKey) missing = `未设置 ${p.keyEnvs[0]}`;
  else if (!baseUrl) missing = `未设置 ${ID}_BASE_URL`;
  else if (!model) missing = `未设置 ${ID}_MODEL`;
  // Keyless providers only count as configured once the operator opted in by naming a model.
  if (!p.needsKey && !env(`${ID}_MODEL`)) missing ??= `未设置 ${ID}_MODEL`;

  return { ...p, apiKey, baseUrl, model, json, configured: !missing, missing };
}

export function allProviders() {
  return PROVIDERS.map((p) => resolveProvider(p.id)!);
}

/**
 * The ordered chain of providers to try.
 * LLM_PROVIDER picks the primary (default "auto" = first configured in registry order);
 * LLM_FALLBACK="deepseek,kimi" adds backups used when the primary errors or is unreachable.
 * Returns [] for demo mode.
 */
export function providerChain(): ResolvedProvider[] {
  const choice = (env("LLM_PROVIDER") ?? "auto").toLowerCase();
  if (choice === "mock") return [];
  const configured = allProviders().filter((p) => p.configured);
  const primary = choice === "auto" ? configured[0] : resolveProvider(choice);
  if (!primary) return [];
  const fallbacks = (env("LLM_FALLBACK") ?? "")
    .split(/[,\s]+/)
    .map((s) => s.toLowerCase())
    .filter((id) => id && id !== primary.id)
    .map((id) => resolveProvider(id))
    .filter((p): p is ResolvedProvider => !!p && p.configured);
  return [primary, ...fallbacks];
}
