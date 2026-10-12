import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { errorResponse, HttpError, readJson } from "@/lib/api";

const Body = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8),
  display_name: z.string().trim().max(40).optional(),
});

export async function POST(req: Request) {
  try {
    const body = await readJson(req, Body);
    const exists = await queryOne(`SELECT 1 FROM users WHERE email = $1`, [body.email]);
    if (exists) throw new HttpError(409, "这个邮箱已经注册过了");
    const hash = await bcrypt.hash(body.password, 10);
    const user = await queryOne<{ id: string }>(
      `INSERT INTO users (email, password_hash, display_name, ics_token) VALUES ($1, $2, $3, $4) RETURNING id`,
      [body.email, hash, body.display_name ?? "", randomBytes(24).toString("base64url")],
    );
    await createSession(Number(user!.id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
