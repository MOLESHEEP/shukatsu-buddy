import bcrypt from "bcryptjs";
import { z } from "zod";
import { HttpError, readJson, withUser } from "@/lib/api";
import { query, queryOne } from "@/lib/db";
import { createSession } from "@/lib/auth";

const Body = z.object({ current: z.string().min(1), next: z.string().min(8, "新密码至少 8 位").max(200) });

/** Changing the password signs out every other device; this browser gets a fresh session. */
export const POST = withUser(async (req, user) => {
  const b = await readJson(req, Body);
  const row = await queryOne<{ password_hash: string }>(`SELECT password_hash FROM users WHERE id = $1`, [user.id]);
  if (!row || !(await bcrypt.compare(b.current, row.password_hash))) throw new HttpError(400, "当前密码不正确");
  await query(`UPDATE users SET password_hash = $2, session_version = session_version + 1 WHERE id = $1`, [user.id, await bcrypt.hash(b.next, 10)]);
  await query(`UPDATE password_resets SET used_at = now() WHERE user_id = $1 AND used_at IS NULL`, [user.id]);
  await createSession(user.id);
  return { ok: true };
});
