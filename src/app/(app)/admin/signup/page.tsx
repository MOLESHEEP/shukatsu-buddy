import { query, queryOne } from "@/lib/db";
import { getSignupSettings } from "@/lib/signup";
import { SignupAdmin, type InviteRow } from "./signup-admin";

export default async function AdminSignup() {
  const [settings, stats, invites] = await Promise.all([
    getSignupSettings(),
    queryOne<{ users: number; today: number; week: number }>(`
      SELECT (SELECT count(*) FROM users WHERE role <> 'admin')::int AS users,
             (SELECT count(*) FROM users WHERE created_at > now() - interval '1 day')::int AS today,
             (SELECT count(*) FROM users WHERE created_at > now() - interval '7 days')::int AS week`),
    query(
      `SELECT c.code, c.note, c.max_uses, c.uses, c.expires_at, c.disabled, c.created_at,
              COALESCE((SELECT array_agg(u.email ORDER BY u.created_at) FROM users u WHERE u.invite_code = c.code), '{}') AS used_by
         FROM invite_codes c ORDER BY c.created_at DESC LIMIT 200`,
    ),
  ]);
  const rows = invites.map((r) => ({
    ...(r as InviteRow),
    expires_at: r.expires_at ? (r.expires_at as Date).toISOString() : null,
    created_at: (r.created_at as Date).toISOString(),
  }));
  const base = (process.env.PUBLIC_URL || "http://localhost:3000").replace(/\/$/, "");
  return <SignupAdmin initial={settings} stats={stats!} invites={rows} registerUrl={`${base}/register`} />;
}
