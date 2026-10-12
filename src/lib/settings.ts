import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { query, queryOne } from "./db";

/**
 * Runtime settings edited in the admin console. Values here override the .env defaults,
 * so the operator can switch LLM vendors / models / keys without redeploying.
 */
export type ProviderOverride = {
  /** AES-256-GCM ciphertext (see sealSecret). Never sent to the browser. */
  apiKey?: string;
  model?: string;
  baseUrl?: string;
};

export type LlmSettings = {
  /** Provider id, "auto", or "mock". Undefined = use LLM_PROVIDER from .env. */
  primary?: string;
  /** Undefined = use LLM_FALLBACK from .env. */
  fallback?: string[];
  providers: Record<string, ProviderOverride>;
  /** Whether users without an explicit per-user switch may use AI. */
  aiDefaultEnabled: boolean;
};

const DEFAULTS: LlmSettings = {
  providers: {},
  aiDefaultEnabled: process.env.AI_DEFAULT_ENABLED === "true",
};

const cache = globalThis as unknown as { llmSettings?: { value: LlmSettings; at: number } };
const TTL_MS = 15_000;

export async function getLlmSettings(): Promise<LlmSettings> {
  const hit = cache.llmSettings;
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const row = await queryOne<{ value: Partial<LlmSettings> }>(`SELECT value FROM app_settings WHERE key = 'llm'`);
  const value: LlmSettings = { ...DEFAULTS, ...(row?.value ?? {}), providers: { ...(row?.value?.providers ?? {}) } };
  cache.llmSettings = { value, at: Date.now() };
  return value;
}

export async function saveLlmSettings(value: LlmSettings) {
  await query(
    `INSERT INTO app_settings (key, value, updated_at) VALUES ('llm', $1, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [JSON.stringify(value)],
  );
  cache.llmSettings = { value, at: Date.now() };
}

// ---------- secret sealing (API keys stored in the database) ----------

function secretKey() {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET must be set");
  return createHash("sha256").update(`llm-keys:${s}`).digest();
}

export function sealSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secretKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), enc.toString("base64url")].join(".");
}

/** Returns null if the value cannot be decrypted (e.g. AUTH_SECRET changed). */
export function openSecret(sealed: string | undefined): string | null {
  if (!sealed) return null;
  try {
    const [v, iv, tag, data] = sealed.split(".");
    if (v !== "v1") return null;
    const decipher = createDecipheriv("aes-256-gcm", secretKey(), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

export function maskSecret(plain: string | null | undefined): string {
  if (!plain) return "";
  return plain.length <= 8 ? "••••" : `${plain.slice(0, 3)}••••${plain.slice(-4)}`;
}
