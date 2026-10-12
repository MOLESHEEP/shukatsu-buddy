import "server-only";
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { query, queryOne, transaction } from "./db";
import { HttpError } from "./api";
import { publicUrl } from "./mail";

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** Creates a one-time reset token. Only its hash is stored; the raw token lives in the link. */
export async function createResetLink(userId: number, origin: "email" | "admin", ttlMinutes: number) {
  const token = randomBytes(32).toString("base64url");
  await query(
    `INSERT INTO password_resets (token_hash, user_id, origin, expires_at)
     VALUES ($1, $2, $3, now() + make_interval(mins => $4::int))`,
    [hashToken(token), userId, origin, ttlMinutes],
  );
  return `${publicUrl()}/reset-password?token=${token}`;
}

export type ResetTokenInfo = { userId: number; email: string };

export async function checkResetToken(token: string): Promise<ResetTokenInfo | null> {
  if (!/^[\w-]{20,100}$/.test(token)) return null;
  const row = await queryOne<{ user_id: number; email: string }>(
    `SELECT r.user_id, u.email FROM password_resets r JOIN users u ON u.id = r.user_id
      WHERE r.token_hash = $1 AND r.used_at IS NULL AND r.expires_at > now() AND u.status = 'active'`,
    [hashToken(token)],
  );
  return row ? { userId: row.user_id, email: row.email } : null;
}

/**
 * Consumes the token and sets the new password in one transaction.
 * All other outstanding links die, and session_version is bumped so every existing login is signed out.
 */
export async function resetPassword(token: string, password: string): Promise<number> {
  const hash = await bcrypt.hash(password, 10);
  return transaction(async (q) => {
    const rows = await q<{ user_id: number }>(
      `UPDATE password_resets SET used_at = now()
        WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
        RETURNING user_id`,
      [hashToken(token)],
    );
    if (!rows.length) throw new HttpError(400, "重置链接无效或已过期，请重新申请");
    const userId = rows[0].user_id;
    const active = await q(`SELECT 1 FROM users WHERE id = $1 AND status = 'active'`, [userId]);
    if (!active.length) throw new HttpError(403, "该账号已被停用");
    await q(`UPDATE users SET password_hash = $2, session_version = session_version + 1 WHERE id = $1`, [userId, hash]);
    await q(`UPDATE password_resets SET used_at = now() WHERE user_id = $1 AND used_at IS NULL`, [userId]);
    return userId;
  });
}
