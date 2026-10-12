import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { queryOne } from "./db";

export const SESSION_COOKIE = "sb_session";
const SESSION_DAYS = 30;

function secretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) throw new Error("AUTH_SECRET must be set (16+ chars)");
  return new TextEncoder().encode(secret);
}

export async function createSession(userId: number) {
  const token = await new SignJWT({ uid: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secretKey());
  const h = await headers();
  const secure = h.get("x-forwarded-proto") === "https" || (process.env.PUBLIC_URL ?? "").startsWith("https://");
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: SESSION_DAYS * 24 * 3600,
  });
}

export async function destroySession() {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function getUserId(): Promise<number | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return typeof payload.uid === "number" ? payload.uid : null;
  } catch {
    return null;
  }
}

export type User = {
  id: number;
  email: string;
  display_name: string;
  grad_year: number | null;
  major: string;
  jp_level: string;
  plan: string;
  es_used: number;
  email_used: number;
  ics_token: string;
};

export async function getUser(): Promise<User | null> {
  const uid = await getUserId();
  if (!uid) return null;
  return queryOne<User>(
    `SELECT id, email, display_name, grad_year, major, jp_level, plan, es_used, email_used, ics_token
       FROM users WHERE id = $1`,
    [uid],
  );
}

/** For server components: redirects to /login when signed out. */
export async function requireUser(): Promise<User> {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}
