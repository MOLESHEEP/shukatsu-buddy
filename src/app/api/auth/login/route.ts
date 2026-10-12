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
    const user = await queryOne<{ id: string; password_hash: string }>(`SELECT id, password_hash FROM users WHERE email = $1`, [body.email]);
    if (!user || !(await bcrypt.compare(body.password, user.password_hash))) throw new HttpError(401, "邮箱或密码不正确");
    await createSession(Number(user.id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
