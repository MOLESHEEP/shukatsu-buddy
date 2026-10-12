import "server-only";
import { createHash } from "node:crypto";
import { query, queryOne } from "./db";

const k = (key: string) => createHash("sha256").update(`throttle:${process.env.AUTH_SECRET ?? ""}:${key}`).digest("hex").slice(0, 32);

/** Number of hits for (kind, key) within the window. */
export async function hits(kind: string, key: string, minutes: number): Promise<number> {
  const r = await queryOne<{ n: number }>(
    `SELECT count(*)::int AS n FROM auth_throttle WHERE kind = $1 AND key = $2 AND created_at > now() - make_interval(mins => $3::int)`,
    [kind, k(key), minutes],
  );
  return r?.n ?? 0;
}

export async function hit(kind: string, key: string) {
  await query(`INSERT INTO auth_throttle (kind, key) VALUES ($1, $2)`, [kind, k(key)]);
  // Opportunistic cleanup keeps the table tiny.
  if (Math.random() < 0.02) await query(`DELETE FROM auth_throttle WHERE created_at < now() - interval '1 day'`);
}

export async function clear(kind: string, key: string) {
  await query(`DELETE FROM auth_throttle WHERE kind = $1 AND key = $2`, [kind, k(key)]);
}
