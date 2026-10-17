import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { query, queryOne, superAdminEmails } from "./db";

export const SESSION_COOKIE = "sb_session";
const SESSION_DAYS = 30;

function secretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) throw new Error("AUTH_SECRET must be set (16+ chars)");
  return new TextEncoder().encode(secret);
}

export async function createSession(userId: number) {
  // The session carries the account's session_version; bumping it (password reset/change) invalidates older sessions.
  const row = await queryOne<{ session_version: number }>(`SELECT session_version FROM users WHERE id = $1`, [userId]);
  const token = await new SignJWT({ uid: userId, sv: row?.session_version ?? 0 })
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

async function readSession(): Promise<{ uid: number; sv: number } | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return typeof payload.uid === "number" ? { uid: payload.uid, sv: typeof payload.sv === "number" ? payload.sv : 0 } : null;
  } catch {
    return null;
  }
}

/** Cheap check (no DB); use getUser() for anything that needs a valid, current session. */
export async function getUserId(): Promise<number | null> {
  return (await readSession())?.uid ?? null;
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
  career_stage: "student" | "working";
  role: "user" | "admin";
  status: "active" | "banned";
  /** NULL = follow the site-wide default set by the admin. */
  ai_enabled: boolean | null;
  session_version: number;
  /** 网页监控 opened for this (non-admin) user by an admin. */
  watch_enabled: boolean;
  /** Show published official schedules on this user's calendar. */
  show_official: boolean;
  /** Derived from SUPER_ADMIN_EMAILS, never stored: can grant / revoke admin rights. */
  is_super: boolean;
};

/** The signed-in user. Banned accounts are treated as signed out. */
export async function getUser(): Promise<User | null> {
  const session = await readSession();
  if (!session) return null;
  const uid = session.uid;
  const user = await queryOne<User>(
    `SELECT id, email, display_name, grad_year, major, jp_level, plan, es_used, email_used, ics_token, career_stage,
            role, status, ai_enabled, session_version, watch_enabled, show_official
       FROM users WHERE id = $1`,
    [uid],
  );
  if (!user || user.status !== "active" || user.session_version !== session.sv) return null;
  user.is_super = user.role === "admin" && superAdminEmails().includes(user.email.toLowerCase());
  // Cheap activity tracking for the admin overview (at most one write per 10 minutes).
  void query(`UPDATE users SET last_seen_at = now() WHERE id = $1 AND (last_seen_at IS NULL OR last_seen_at < now() - interval '10 minutes')`, [
    uid,
  ]).catch(() => {});
  return user;
}

/** For server components: redirects to /login when signed out. */
export async function requireUser(): Promise<User> {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/dashboard");
  return user;
}
