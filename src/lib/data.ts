import "server-only";
import { query, queryOne } from "./db";
import { DEFAULT_STAGES } from "./constants";
import { HttpError } from "./api";

export type Company = {
  id: number;
  name: string;
  industry: string;
  channel: string;
  current_stage: string;
  status: string;
  next_action: string;
  next_deadline: string | null;
  notes: string;
  updated_at: string;
};
export type Stage = { id: number; company_id: number; name: string; date: string | null; result: string; position: number };
export type Test = { id: number; company_id: number; type: string; format: string; deadline: string | null; status: string; confidence: number | null };
export type CalEvent = { id: number; company_id: number; kind: string; title: string; starts_at: string; location: string; prep: string };

// pg returns BIGINT/TIMESTAMPTZ as string/Date; normalise for JSON + client components.
function norm<T>(row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    out[k] = v instanceof Date ? v.toISOString() : k === "id" || k.endsWith("_id") ? (v == null ? v : Number(v)) : v;
  }
  return out as T;
}
const normAll = <T>(rows: Record<string, unknown>[]) => rows.map((r) => norm<T>(r));

export async function listCompanies(userId: number) {
  return normAll<Company>(await query(`SELECT * FROM companies WHERE user_id = $1 ORDER BY updated_at DESC`, [userId]));
}

export async function assertCompany(userId: number, companyId: number) {
  const row = await queryOne(`SELECT id FROM companies WHERE id = $1 AND user_id = $2`, [companyId, userId]);
  if (!row) throw new HttpError(404, "找不到这家公司");
}

export async function getCompanyDetail(userId: number, companyId: number) {
  const row = await queryOne(`SELECT * FROM companies WHERE id = $1 AND user_id = $2`, [companyId, userId]);
  if (!row) return null;
  const [stages, tests, events, esDocs] = await Promise.all([
    query(`SELECT * FROM stages WHERE company_id = $1 ORDER BY position, id`, [companyId]),
    query(`SELECT * FROM tests WHERE company_id = $1 ORDER BY created_at`, [companyId]),
    query(`SELECT * FROM events WHERE company_id = $1 ORDER BY starts_at`, [companyId]),
    query(`SELECT id, question, created_at FROM es_docs WHERE company_id = $1 AND user_id = $2 ORDER BY created_at DESC`, [companyId, userId]),
  ]);
  return {
    company: norm<Company>(row),
    stages: normAll<Stage>(stages),
    tests: normAll<Test>(tests),
    events: normAll<CalEvent>(events),
    esDocs: normAll<{ id: number; question: string; created_at: string }>(esDocs),
  };
}

export async function createCompany(
  userId: number,
  input: { name: string; industry?: string; channel?: string; notes?: string; next_action?: string; next_deadline?: string | null },
) {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO companies (user_id, name, industry, channel, notes, next_action, next_deadline)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [userId, input.name, input.industry ?? "", input.channel ?? "", input.notes ?? "", input.next_action ?? "", input.next_deadline ?? null],
  );
  const id = Number(row!.id);
  await query(
    `INSERT INTO stages (company_id, name, position) SELECT $1, s, ord FROM unnest($2::text[]) WITH ORDINALITY AS t(s, ord)`,
    [id, DEFAULT_STAGES],
  );
  return id;
}

/** Find a company by (fuzzy) name, or create it. Used when confirming a parsed email. */
export async function findOrCreateCompany(userId: number, name: string) {
  const clean = name.replace(/株式会社|（株）|\(株\)/g, "").trim();
  const existing = await queryOne<{ id: string }>(
    `SELECT id FROM companies WHERE user_id = $1 AND (name = $2 OR name ILIKE '%' || $3 || '%') ORDER BY updated_at DESC LIMIT 1`,
    [userId, name, clean || name],
  );
  return existing ? Number(existing.id) : createCompany(userId, { name });
}

export type UpcomingItem = {
  key: string;
  company_id: number;
  company: string;
  kind: string;
  title: string;
  at: string;
  location?: string;
  prep?: string;
  /** Published by an admin (官方选考日程), not the user's own event. */
  official?: boolean;
  /** Where the item links to; defaults to the company card. */
  href?: string;
};

/** Everything with a date in the window: events, next-action deadlines, test deadlines. */
export async function upcoming(userId: number, fromDays = 0, toDays = 30) {
  const params = [userId, `${fromDays} days`, `${toDays} days`];
  const window = `BETWEEN date_trunc('day', now()) + $2::interval AND now() + $3::interval`;
  const [events, deadlines, tests] = await Promise.all([
    query(
      `SELECT e.id, e.company_id, c.name AS company, e.kind, e.title, e.starts_at AS at, e.location, e.prep
         FROM events e JOIN companies c ON c.id = e.company_id
        WHERE c.user_id = $1 AND e.starts_at ${window}`,
      params,
    ),
    query(
      `SELECT id, id AS company_id, name AS company, next_action AS title, next_deadline AS at
         FROM companies WHERE user_id = $1 AND status = 'active' AND next_deadline ${window}`,
      params,
    ),
    query(
      `SELECT t.id, t.company_id, c.name AS company, t.type, t.deadline AS at
         FROM tests t JOIN companies c ON c.id = t.company_id
        WHERE c.user_id = $1 AND t.status = 'todo' AND t.deadline ${window}`,
      params,
    ),
  ]);
  const items: UpcomingItem[] = [
    ...events.map((r) => ({ ...norm<Omit<UpcomingItem, "key">>(r), key: `e${r.id}` })),
    ...deadlines.map((r) => ({ ...norm<Omit<UpcomingItem, "key">>({ ...r, kind: "deadline", title: r.title || "下一步截止" }), key: `c${r.id}` })),
    ...tests.map((r) => ({ ...norm<Omit<UpcomingItem, "key">>({ ...r, kind: "test", title: "笔试受检期限" }), key: `t${r.id}` })),
  ];
  return items.sort((a, b) => a.at.localeCompare(b.at));
}

/** Calendar month: same sources as upcoming(), bounded by explicit dates. */
export async function calendarItems(userId: number, startIso: string, endIso: string) {
  const params = [userId, startIso, endIso];
  const [events, deadlines, tests] = await Promise.all([
    query(
      `SELECT e.id, e.company_id, c.name AS company, e.kind, e.title, e.starts_at AS at, e.location
         FROM events e JOIN companies c ON c.id = e.company_id
        WHERE c.user_id = $1 AND e.starts_at >= $2 AND e.starts_at < $3`,
      params,
    ),
    query(
      `SELECT id, id AS company_id, name AS company, next_action AS title, next_deadline AS at
         FROM companies WHERE user_id = $1 AND next_deadline >= $2 AND next_deadline < $3`,
      params,
    ),
    query(
      `SELECT t.id, t.company_id, c.name AS company, t.deadline AS at
         FROM tests t JOIN companies c ON c.id = t.company_id
        WHERE c.user_id = $1 AND t.deadline >= $2 AND t.deadline < $3`,
      params,
    ),
  ]);
  const items: UpcomingItem[] = [
    ...events.map((r) => ({ ...norm<Omit<UpcomingItem, "key">>(r), key: `e${r.id}` })),
    ...deadlines.map((r) => ({ ...norm<Omit<UpcomingItem, "key">>({ ...r, kind: "deadline", title: r.title || "下一步截止" }), key: `c${r.id}` })),
    ...tests.map((r) => ({ ...norm<Omit<UpcomingItem, "key">>({ ...r, kind: "test", title: "笔试受检期限" }), key: `t${r.id}` })),
  ];
  return items.sort((a, b) => a.at.localeCompare(b.at));
}

/** Applications per stage and pass rates, for the 复盘 view. */
export async function stats(userId: number) {
  const companies = await query<{ status: string }>(`SELECT status FROM companies WHERE user_id = $1`, [userId]);
  const stageRows = await query<{ name: string; passed: string; failed: string; total: string }>(
    `SELECT s.name,
            count(*) FILTER (WHERE s.result = 'passed') AS passed,
            count(*) FILTER (WHERE s.result = 'failed') AS failed,
            count(*) AS total
       FROM stages s JOIN companies c ON c.id = s.company_id
      WHERE c.user_id = $1
      GROUP BY s.name`,
    [userId],
  );
  const byName = new Map(stageRows.map((r) => [r.name, r]));
  const order = [...DEFAULT_STAGES, ...stageRows.map((r) => r.name).filter((n) => !(DEFAULT_STAGES as readonly string[]).includes(n))];
  const stages = order
    .map((name) => {
      const r = byName.get(name);
      const passed = Number(r?.passed ?? 0);
      const failed = Number(r?.failed ?? 0);
      return { name, passed, failed, decided: passed + failed, rate: passed + failed ? passed / (passed + failed) : null };
    })
    .filter((s) => s.decided > 0);
  return {
    total: companies.length,
    active: companies.filter((c) => c.status === "active").length,
    offers: companies.filter((c) => c.status === "offer").length,
    closed: companies.filter((c) => c.status === "rejected" || c.status === "withdrawn").length,
    stages,
  };
}
