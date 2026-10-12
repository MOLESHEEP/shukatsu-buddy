import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { Pool, types, type QueryResultRow } from "pg";

// BIGINT (ids, counts) as JS numbers instead of strings; our ids never approach 2^53.
types.setTypeParser(types.builtins.INT8, (v) => Number(v));

const globalForDb = globalThis as unknown as { pool?: Pool; schemaReady?: Promise<void> };

function getPool(): Pool {
  if (!globalForDb.pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is not set");
    globalForDb.pool = new Pool({ connectionString, max: 10 });
  }
  return globalForDb.pool;
}

async function applySchema() {
  const sql = await fs.readFile(path.join(process.cwd(), "db", "schema.sql"), "utf8");
  await getPool().query(sql);
  await seedAdmins();
}

export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? process.env.ADMIN_EMAIL ?? "")
    .split(/[,\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Admins come only from the server environment (never from the repo):
 * ADMIN_EMAILS marks accounts as admin; ADMIN_PASSWORD creates the account if it does not exist yet.
 * An existing admin's password is never overwritten, so it can be changed in Settings.
 */
async function seedAdmins() {
  const emails = adminEmails();
  if (!emails.length) return;
  const pool = getPool();
  const password = process.env.ADMIN_PASSWORD;
  if (password) {
    const bcrypt = (await import("bcryptjs")).default;
    const { randomBytes } = await import("node:crypto");
    for (const email of emails) {
      const exists = await pool.query(`SELECT 1 FROM users WHERE email = $1`, [email]);
      if (exists.rowCount) continue;
      await pool.query(
        `INSERT INTO users (email, password_hash, display_name, ics_token, role, ai_enabled) VALUES ($1, $2, '管理员', $3, 'admin', true)
         ON CONFLICT (email) DO NOTHING`,
        [email, await bcrypt.hash(password, 10), randomBytes(24).toString("base64url")],
      );
      console.log(`[admin] created admin account ${email}`);
    }
  }
  await pool.query(`UPDATE users SET role = 'admin', status = 'active' WHERE email = ANY($1::text[]) AND role <> 'admin'`, [emails]);
}

function ensureSchema(): Promise<void> {
  if (!globalForDb.schemaReady) {
    globalForDb.schemaReady = applySchema().catch((err) => {
      globalForDb.schemaReady = undefined; // retry on next request
      throw err;
    });
  }
  return globalForDb.schemaReady;
}

export async function query<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []) {
  await ensureSchema();
  const res = await getPool().query<T>(text, params);
  return res.rows;
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []) {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}
