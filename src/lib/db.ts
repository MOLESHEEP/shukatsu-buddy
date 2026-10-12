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
