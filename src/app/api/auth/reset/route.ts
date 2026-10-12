import { z } from "zod";
import { NextResponse } from "next/server";
import { errorResponse, readJson } from "@/lib/api";
import { createSession } from "@/lib/auth";
import { resetPassword } from "@/lib/password-reset";

const Body = z.object({ token: z.string().min(20).max(100), password: z.string().min(8, "新密码至少 8 位").max(200) });

/** Sets a new password from a one-time link, signs out all other sessions, and logs this browser in. */
export async function POST(req: Request) {
  try {
    const b = await readJson(req, Body);
    const userId = await resetPassword(b.token, b.password);
    await createSession(userId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
