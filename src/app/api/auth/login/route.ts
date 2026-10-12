import bcrypt from "bcryptjs";
import { z } from "zod";
import { NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { errorResponse, HttpError, readJson } from "@/lib/api";
import { clientIp } from "@/lib/signup";
import { clear, hit, hits } from "@/lib/throttle";

const Body = z.object({ email: z.string().trim().toLowerCase(), password: z.string() });

const MAX_FAILS = 10;
const WINDOW_MIN = 15;

export async function POST(req: Request) {
  try {
    const body = await readJson(req, Body);
    // Brute-force guard: too many failures for this account from this network -> wait.
    const key = `${body.email}|${clientIp(req)}`;
    if ((await hits("login_fail", key, WINDOW_MIN)) >= MAX_FAILS) {
      throw new HttpError(429, `密码错误次数太多，请 ${WINDOW_MIN} 分钟后再试，或使用「忘记密码」`);
    }
    const user = await queryOne<{ id: number; password_hash: string; status: string }>(`SELECT id, password_hash, status FROM users WHERE email = $1`, [
      body.email,
    ]);
    if (!user || !(await bcrypt.compare(body.password, user.password_hash))) {
      await hit("login_fail", key);
      throw new HttpError(401, "邮箱或密码不正确");
    }
    if (user.status !== "active") throw new HttpError(403, "该账号已被停用，如有疑问请联系管理员");
    await clear("login_fail", key);
    await createSession(user.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
