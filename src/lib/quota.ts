import "server-only";
import { query } from "./db";
import { HttpError } from "./api";
import type { User } from "./auth";

type Kind = "es" | "email";

export function quotaInfo(user: User) {
  const enforced = process.env.ENFORCE_QUOTA === "true" && user.plan === "free";
  return {
    enforced,
    es: { used: user.es_used, limit: Number(process.env.FREE_ES_LIMIT ?? 3) },
    email: { used: user.email_used, limit: Number(process.env.FREE_EMAIL_LIMIT ?? 5) },
  };
}

export function checkQuota(user: User, kind: Kind) {
  const q = quotaInfo(user);
  if (q.enforced && q[kind].used >= q[kind].limit) {
    throw new HttpError(402, kind === "es" ? "免费版 ES 添削次数已用完" : "免费版邮件识别次数已用完");
  }
}

export async function recordUsage(userId: number, kind: Kind) {
  const col = kind === "es" ? "es_used" : "email_used";
  await query(`UPDATE users SET ${col} = ${col} + 1 WHERE id = $1`, [userId]);
}
