import bcrypt from "bcryptjs";
import { z } from "zod";
import { NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { errorResponse, HttpError, readJson } from "@/lib/api";

const Body = z.object({ email: z.string().trim().toLowerCase(), password: z.string() });

export async function POST(req: Request) {
  try {
    const body = await readJson(req, Body);
    const user = await queryOne<{ id: number; password_hash: string; status: string }>(`SELECT id, password_hash, status FROM users WHERE email = $1`, [
      body.email,
    ]);
    if (!user || !(await bcrypt.compare(body.password, user.password_hash))) throw new HttpError(401, "邮箱或密码不正确");
    if (user.status !== "active") throw new HttpError(403, "该账号已被停用，如有疑问请联系管理员");
    await createSession(Number(user.id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
