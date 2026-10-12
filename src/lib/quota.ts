import "server-only";
import { query, queryOne } from "./db";
import { HttpError } from "./api";
import type { User } from "./auth";
import { APP_TZ } from "./time";

/**
 * Daily AI limits, reset at midnight in APP_TIMEZONE.
 * Usage is counted from successful rows in ai_usage, so failed calls and manual saves never count.
 */
export type QuotaKind = "es" | "email" | "post";

export const QUOTA_LABELS: Record<QuotaKind, string> = { es: "ES 添削", email: "邮件助手", post: "经验整理" };

/** Which logged AI tasks count toward each daily limit (email assistant = parsing + reply drafts). */
const TASKS: Record<QuotaKind, string[]> = { es: ["es"], email: ["email", "reply"], post: ["post"] };

export type Limits = Record<QuotaKind, number>;

export const DEFAULT_LIMITS: Limits = { es: 10, email: 10, post: 10 };

const cache = globalThis as unknown as { limits?: { value: Limits; at: number } };

export async function getDefaultLimits(): Promise<Limits> {
  if (cache.limits && Date.now() - cache.limits.at < 15_000) return cache.limits.value;
  const row = await queryOne<{ value: Partial<Limits> }>(`SELECT value FROM app_settings WHERE key = 'limits'`);
  const value = { ...DEFAULT_LIMITS, ...(row?.value ?? {}) };
  cache.limits = { value, at: Date.now() };
  return value;
}

export async function saveDefaultLimits(value: Limits) {
  await query(
    `INSERT INTO app_settings (key, value, updated_at) VALUES ('limits', $1, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [JSON.stringify(value)],
  );
  cache.limits = { value, at: Date.now() };
}

const startOfToday = `(date_trunc('day', now() AT TIME ZONE '${APP_TZ.replace(/'/g, "")}') AT TIME ZONE '${APP_TZ.replace(/'/g, "")}')`;

async function usedToday(userId: number): Promise<Limits> {
  const rows = await query<{ task: string; n: number }>(
    `SELECT task, count(*)::int AS n FROM ai_usage
      WHERE user_id = $1 AND ok
        AND created_at >= GREATEST(${startOfToday}, COALESCE((SELECT quota_reset_at FROM users WHERE id = $1), '-infinity'))
      GROUP BY task`,
    [userId],
  );
  const byTask = Object.fromEntries(rows.map((r) => [r.task, r.n]));
  const sum = (k: QuotaKind) => TASKS[k].reduce((s, t) => s + (byTask[t] ?? 0), 0);
  return { es: sum("es"), email: sum("email"), post: sum("post") };
}

export type QuotaStatus = { unlimited: boolean; used: Limits; limit: Limits };

export async function quotaStatus(user: User): Promise<QuotaStatus> {
  const [defaults, used, own] = await Promise.all([
    getDefaultLimits(),
    usedToday(user.id),
    queryOne<{ limit_es: number | null; limit_email: number | null; limit_post: number | null }>(
      `SELECT limit_es, limit_email, limit_post FROM users WHERE id = $1`,
      [user.id],
    ),
  ]);
  return {
    unlimited: user.role === "admin",
    used,
    limit: { es: own?.limit_es ?? defaults.es, email: own?.limit_email ?? defaults.email, post: own?.limit_post ?? defaults.post },
  };
}

export async function checkQuota(user: User, kind: QuotaKind) {
  const q = await quotaStatus(user);
  if (q.unlimited) return;
  if (q.used[kind] >= q.limit[kind]) {
    throw new HttpError(429, `今天的${QUOTA_LABELS[kind]}次数（${q.limit[kind]} 次）已用完，明天 0 点（日本时间）恢复`);
  }
}
