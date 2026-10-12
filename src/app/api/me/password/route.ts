import bcrypt from "bcryptjs";
import { z } from "zod";
import { HttpError, readJson, withUser } from "@/lib/api";
import { query, queryOne } from "@/lib/db";

const Body = z.object({ current: z.string().min(1), next: z.string().min(8, "新密码至少 8 位").max(200) });

export const POST = withUser(async (req, user) => {
  const b = await readJson(req, Body);
  const row = await queryOne<{ password_hash: string }>(`SELECT password_hash FROM users WHERE id = $1`, [user.id]);
  if (!row || !(await bcrypt.compare(b.current, row.password_hash))) throw new HttpError(400, "当前密码不正确");
  await query(`UPDATE users SET password_hash = $2 WHERE id = $1`, [user.id, await bcrypt.hash(b.next, 10)]);
  return { ok: true };
});
