import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { query, queryOne } from "./db";

/** Registration policy, edited in 管理后台 → 注册与邀请. */
export type SignupSettings = {
  mode: "open" | "invite" | "closed";
  /** Max number of non-admin accounts; null = unlimited. */
  maxUsers: number | null;
  /** Max new accounts per day (site-wide); null = unlimited. */
  dailyMax: number | null;
  /** Max new accounts per IP per day; null = unlimited. */
  perIpDaily: number | null;
  /** Shown on the register page when registration is closed or full. */
  message: string;
};

export const DEFAULT_SIGNUP: SignupSettings = { mode: "open", maxUsers: null, dailyMax: 50, perIpDaily: 3, message: "" };

const cache = globalThis as unknown as { signup?: { value: SignupSettings; at: number } };

export async function getSignupSettings(): Promise<SignupSettings> {
  if (cache.signup && Date.now() - cache.signup.at < 15_000) return cache.signup.value;
  const row = await queryOne<{ value: Partial<SignupSettings> }>(`SELECT value FROM app_settings WHERE key = 'signup'`);
  const value = { ...DEFAULT_SIGNUP, ...(row?.value ?? {}) };
  cache.signup = { value, at: Date.now() };
  return value;
}

export async function saveSignupSettings(value: SignupSettings) {
  await query(
    `INSERT INTO app_settings (key, value, updated_at) VALUES ('signup', $1, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [JSON.stringify(value)],
  );
  cache.signup = { value, at: Date.now() };
}

/** Client IP behind Cloudflare / a reverse proxy. */
export function clientIp(req: Request): string {
  const h = req.headers;
  return h.get("cf-connecting-ip") || h.get("x-real-ip") || h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

/** We only keep a keyed hash of the IP, enough to rate-limit but not to recover the address. */
export function hashIp(ip: string): string {
  return createHash("sha256").update(`signup-ip:${process.env.AUTH_SECRET ?? ""}:${ip}`).digest("hex").slice(0, 32);
}

export type SignupStatus = { mode: SignupSettings["mode"]; open: boolean; reason: string | null };

/** What the register page should show (public). */
export async function signupStatus(): Promise<SignupStatus> {
  const s = await getSignupSettings();
  if (s.mode === "closed") return { mode: s.mode, open: false, reason: s.message || "目前暂停新用户注册。" };
  if (s.maxUsers != null) {
    const n = await queryOne<{ n: number }>(`SELECT count(*)::int AS n FROM users WHERE role <> 'admin'`);
    if ((n?.n ?? 0) >= s.maxUsers) return { mode: s.mode, open: false, reason: s.message || "注册名额已满，请稍后再来。" };
  }
  return { mode: s.mode, open: true, reason: null };
}

export function newInviteCode(): string {
  // Unambiguous characters only (no 0/O/1/I/L).
  const alphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
  const bytes = randomBytes(8);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("").replace(/^(.{4})/, "$1-");
}
