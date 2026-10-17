import "server-only";
import { z } from "zod";
import { query, queryOne, transaction } from "./db";
import { HttpError } from "./api";
import type { User } from "./auth";
import { aiAccess } from "./ai-access";
import { findOrCreateCompany, type UpcomingItem } from "./data";
import { fetchPage, textHash } from "./fetch-page";
import { extractWatch } from "./llm/tasks";
import type { WatchExtract } from "./llm/schemas";
import { follow } from "./openings";
import { companyKey, formatOpeningDate } from "./openings-shared";
import { APP_TZ, localToIso } from "./time";
import {
  ITEM_KINDS,
  PERSONAL_LIMITS,
  PublishOptions,
  TRACKER_KIND,
  WATCH_PHASES,
  WatchPageInput,
  canWatch,
  roundText,
  type Detection,
  type OfficialSchedule,
  type ScheduleInputValue,
  type WatchPage,
} from "./watch-shared";

/**
 * 网页监控 → 官方选考日程.
 *
 *   watch_pages ──(scheduler / 立即检查: fetch, and only if the text changed)──▶ AI reading ──▶ watch_detections
 *   paste page text ─────────────────────────────────────────────────────────────▶ AI reading ──▶ watch_detections
 *   admin checks / corrects a detection ──▶ official_schedules (+ items) ──▶ calendars marked 官方, optional notice
 *
 * Admin pages and detections are a pool shared by every admin. Users an admin opened the feature for get
 * personal pages only they see; they can copy a reading into their own tracker but never publish to others.
 * Official schedules never touch users' own companies / events unless the user copies one in (official_tracks).
 */

type Q = Parameters<Parameters<typeof transaction>[0]>[0];

const iso = (d: unknown) => (d instanceof Date ? d.toISOString() : (d as string | null));
const tz = APP_TZ.replace(/'/g, "");
const startOfToday = `(date_trunc('day', now() AT TIME ZONE '${tz}') AT TIME ZONE '${tz}')`;

export function requireWatch(user: User) {
  if (!canWatch(user)) throw new HttpError(403, `网页监控还没有为你开通，请把你的用户 ID（${user.id}）发给管理员`);
}

/** Rows this user may see: the admin pool for admins, their own personal rows for everyone else. */
function visible(user: User, alias: string, offset: number) {
  return user.role === "admin" ? `(${alias}.scope = 'admin' OR ${alias}.owner_id = $${offset})` : `(${alias}.scope = 'personal' AND ${alias}.owner_id = $${offset})`;
}

// ---------- pages ----------

const PAGE_COLS = `p.id, p.owner_id, u.email AS owner_email, p.scope, p.company_name, p.url, p.grad_year, p.interval_hours, p.active,
  p.last_checked_at, p.last_status, p.last_error, p.next_check_at,
  (SELECT d.id FROM watch_detections d WHERE d.page_id = p.id ORDER BY d.created_at DESC LIMIT 1) AS latest_detection_id`;

function normPage(r: Record<string, unknown>): WatchPage {
  return { ...(r as WatchPage), last_checked_at: iso(r.last_checked_at), next_check_at: iso(r.next_check_at)! };
}

export async function listPages(user: User): Promise<WatchPage[]> {
  const rows = await query(
    `SELECT ${PAGE_COLS} FROM watch_pages p JOIN users u ON u.id = p.owner_id WHERE ${visible(user, "p", 1)} ORDER BY p.company_name, p.id`,
    [user.id],
  );
  return rows.map(normPage);
}

async function getPageFor(user: User, id: number) {
  const row = await queryOne(`SELECT ${PAGE_COLS} FROM watch_pages p JOIN users u ON u.id = p.owner_id WHERE p.id = $2 AND ${visible(user, "p", 1)}`, [user.id, id]);
  if (!row) throw new HttpError(404, "找不到这个监控页面");
  return normPage(row);
}

function checkLimits(user: User, interval: number) {
  if (user.role !== "admin" && interval < PERSONAL_LIMITS.minInterval) throw new HttpError(400, `检查频率最高每 ${PERSONAL_LIMITS.minInterval} 小时一次`);
}

export async function addPage(user: User, input: z.infer<typeof WatchPageInput>) {
  requireWatch(user);
  checkLimits(user, input.interval_hours);
  const scope = user.role === "admin" ? "admin" : "personal";
  const n = await queryOne<{ n: number }>(`SELECT count(*)::int AS n FROM watch_pages WHERE scope = $1 AND ($1 = 'admin' OR owner_id = $2)`, [scope, user.id]);
  const max = scope === "admin" ? 300 : PERSONAL_LIMITS.pages;
  if ((n?.n ?? 0) >= max) throw new HttpError(400, `最多监控 ${max} 个页面`);
  const dup = await queryOne(`SELECT 1 FROM watch_pages WHERE url = $1 AND scope = $2 AND ($2 = 'admin' OR owner_id = $3)`, [input.url, scope, user.id]);
  if (dup) throw new HttpError(409, "这个网址已经在监控了");
  const row = await queryOne<{ id: number }>(
    `INSERT INTO watch_pages (owner_id, scope, company_name, url, grad_year, interval_hours, active) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [user.id, scope, input.company_name, input.url, input.grad_year ?? null, input.interval_hours, input.active],
  );
  return row!.id;
}

export async function updatePage(user: User, id: number, input: z.infer<typeof WatchPageInput>) {
  requireWatch(user);
  await getPageFor(user, id);
  checkLimits(user, input.interval_hours);
  await query(
    `UPDATE watch_pages SET company_name = $2, url = $3, grad_year = $4, interval_hours = $5, active = $6,
            content_hash = CASE WHEN url = $3 THEN content_hash ELSE '' END,
            next_check_at = CASE WHEN $6 AND NOT active THEN now() ELSE next_check_at END
      WHERE id = $1`,
    [id, input.company_name, input.url, input.grad_year ?? null, input.interval_hours, input.active],
  );
}

export async function deletePage(user: User, id: number) {
  requireWatch(user);
  await getPageFor(user, id);
  // Detections that were published stay (the official schedule points at them); the rest go with the page.
  await query(`UPDATE watch_detections SET page_id = NULL WHERE page_id = $1 AND status IN ('published', 'tracked')`, [id]);
  await query(`DELETE FROM watch_pages WHERE id = $1`, [id]);
}

// ---------- reading a page ----------

/** Personal users: AI readings per day, and AI must be opened for them. Admin pool readings are a site cost. */
async function assertAiBudget(owner: { id: number; role: string; scope: string }, user?: User) {
  if (owner.scope === "admin") return;
  // Scheduled checks have no signed-in user: look the owner up so a user whose AI was switched off isn't charged to the site.
  const who = user ?? ((await queryOne(`SELECT id, role, ai_enabled FROM users WHERE id = $1`, [owner.id])) as User | null);
  if (!who || !(await aiAccess(who)).allowed) throw new HttpError(403, "这个账号还没有开通 AI，无法识别页面内容");
  const used = await queryOne<{ n: number }>(`SELECT count(*)::int AS n FROM ai_usage WHERE user_id = $1 AND task = 'watch' AND ok AND created_at >= ${startOfToday}`, [owner.id]);
  if ((used?.n ?? 0) >= PERSONAL_LIMITS.aiPerDay) throw new HttpError(429, `今天的页面识别次数（${PERSONAL_LIMITS.aiPerDay} 次）已用完，明天再试`);
}

/** Server-side ranges the schema can't express; also drops dates the AI wrote in a wrong format. */
function clean(r: WatchExtract): WatchExtract {
  return {
    ...r,
    confidence: Math.max(0, Math.min(1, Number(r.confidence) || 0)),
    round_no: r.round_no && r.round_no > 0 && r.round_no < 21 ? Math.round(r.round_no) : null,
    grad_year: r.grad_year && r.grad_year > 2000 && r.grad_year < 2101 ? r.grad_year : null,
    entry_url: r.entry_url && /^https?:\/\/\S+$/i.test(r.entry_url) ? r.entry_url : null,
    items: r.items.filter((i) => localToIso(i.start_local)).slice(0, 30),
    evidence_ja: r.evidence_ja.slice(0, 5),
  };
}

const signature = (r: Detection["result"] | WatchExtract) =>
  JSON.stringify([r.phase, r.round_no, r.round_label, [...r.items].map((i) => `${i.kind}|${i.start_local}`).sort()]);

async function saveDetection(
  q: Q,
  d: { pageId: number | null; ownerId: number; scope: string; source: string; url: string; hash: string; result: WatchExtract },
): Promise<number> {
  const [row] = await q<{ id: number }>(
    `INSERT INTO watch_detections (page_id, owner_id, scope, source, source_url, content_hash, result) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [d.pageId, d.ownerId, d.scope, d.source, d.url, d.hash, JSON.stringify(d.result)],
  );
  return row.id;
}

/** Tells the page owner when a reading says 本选考 is open / announced and differs from the previous reading. */
async function notifyOwner(q: Q, ownerId: number, company: string, detectionId: number, r: WatchExtract) {
  const phase = WATCH_PHASES[r.phase]?.label ?? r.phase;
  const round = roundText(r);
  await q(`INSERT INTO announcements (title, body, link, level, audience, user_ids, created_by) VALUES ($1, $2, $3, 'important', 'ids', ARRAY[$4::bigint], NULL)`, [
    `网页监控：「${company}」本选考${phase}${round ? ` · ${round}` : ""}`,
    `${r.summary_zh}\n\nAI 识别结果（可信度 ${Math.round(r.confidence * 100)}%），请打开确认后再发布。`,
    `/watch?tab=detections#d-${detectionId}`,
    ownerId,
  ]);
}

export type CheckResult = { status: "unchanged" | "changed" | "error"; detectionId: number | null; error?: string; thin?: boolean };

type PageRow = { id: number; owner_id: number; scope: string; company_name: string; url: string; content_hash: string; interval_hours: number; owner_role: string };

/**
 * Fetches one page; when its text changed (or `force`), runs the AI reading and stores a detection.
 * Never throws for fetch / AI problems — they are recorded on the page so the scheduler keeps going.
 */
export async function checkPageRow(p: PageRow, opts: { source: "auto" | "manual"; force?: boolean; user?: User }): Promise<CheckResult> {
  const next = `now() + make_interval(hours => ${Math.max(1, Number(p.interval_hours) || 24)})`;
  const fail = async (msg: string): Promise<CheckResult> => {
    await query(`UPDATE watch_pages SET last_checked_at = now(), last_status = 'error', last_error = $2, next_check_at = ${next} WHERE id = $1`, [p.id, msg.slice(0, 300)]);
    return { status: "error", detectionId: null, error: msg };
  };
  let page;
  try {
    page = await fetchPage(p.url);
  } catch (err) {
    return fail(err instanceof Error ? err.message : "抓取失败");
  }
  if (page.hash === p.content_hash && !opts.force) {
    await query(`UPDATE watch_pages SET last_checked_at = now(), last_status = 'unchanged', last_error = '', next_check_at = ${next} WHERE id = $1`, [p.id]);
    return { status: "unchanged", detectionId: null, thin: page.thin };
  }
  let result: WatchExtract;
  try {
    await assertAiBudget({ id: p.owner_id, role: p.owner_role, scope: p.scope }, opts.user);
    result = clean(await extractWatch({ company: p.company_name, url: page.url, text: page.text }, p.scope === "admin" ? null : p.owner_id));
  } catch (err) {
    // content_hash is not updated, so the next check tries the AI again.
    return fail(`AI 识别失败：${err instanceof Error ? err.message : "未知错误"}`);
  }
  const detectionId = await transaction(async (q) => {
    const [prev] = await q<{ result: Detection["result"] }>(`SELECT result FROM watch_detections WHERE page_id = $1 ORDER BY created_at DESC LIMIT 1`, [p.id]);
    const id = await saveDetection(q, { pageId: p.id, ownerId: p.owner_id, scope: p.scope, source: opts.source, url: page.url, hash: page.hash, result });
    await q(
      `UPDATE watch_pages SET content_hash = $2, last_checked_at = now(), last_status = 'changed', last_error = $3, next_check_at = ${next} WHERE id = $1`,
      [p.id, page.hash, page.thin ? "页面文字很少，可能需要 JS 才能显示内容；识别结果可能不完整" : ""],
    );
    const interesting = result.is_selection_page && (result.phase === "open" || result.phase === "upcoming");
    if (opts.source === "auto" && interesting && (!prev || signature(prev.result) !== signature(result))) await notifyOwner(q, p.owner_id, p.company_name, id, result);
    return id;
  });
  return { status: "changed", detectionId, thin: page.thin };
}

const PAGE_ROW = `p.id, p.owner_id, p.scope, p.company_name, p.url, p.content_hash, p.interval_hours, u.role AS owner_role`;

export async function checkPageNow(user: User, id: number, force = false) {
  requireWatch(user);
  await getPageFor(user, id);
  const row = await queryOne<PageRow>(`SELECT ${PAGE_ROW} FROM watch_pages p JOIN users u ON u.id = p.owner_id WHERE p.id = $1`, [id]);
  return checkPageRow(row!, { source: "manual", force, user });
}

/** Reads pasted page text (for pages the fetcher can't see: JS-rendered, login walls, PDFs). */
export async function readPasted(user: User, input: { company_name: string; url: string; text: string }) {
  requireWatch(user);
  const scope = user.role === "admin" ? "admin" : "personal";
  await assertAiBudget({ id: user.id, role: user.role, scope }, user);
  const text = input.text.trim().slice(0, 15_000);
  const result = clean(await extractWatch({ company: input.company_name, url: input.url, text }, scope === "admin" ? null : user.id));
  return transaction((q) => saveDetection(q, { pageId: null, ownerId: user.id, scope, source: "paste", url: input.url, hash: textHash(text), result }));
}

/** Scheduler: claims due pages atomically (safe if two ticks overlap) and checks them one by one. */
export async function runDueChecks(limit = 5) {
  const claimed = await query<PageRow>(
    `UPDATE watch_pages p SET next_check_at = now() + interval '30 minutes'
       FROM users u
      WHERE u.id = p.owner_id AND p.id IN (
        SELECT p2.id FROM watch_pages p2 JOIN users u2 ON u2.id = p2.owner_id
         WHERE p2.active AND p2.next_check_at <= now()
           AND (p2.scope = 'admin' OR (u2.status = 'active' AND (u2.role = 'admin' OR u2.watch_enabled)))
         ORDER BY p2.next_check_at LIMIT $1 FOR UPDATE OF p2 SKIP LOCKED)
      RETURNING ${PAGE_ROW}`,
    [limit],
  );
  const out: { id: number; status: string }[] = [];
  for (const p of claimed) {
    const r = await checkPageRow(p, { source: "auto" });
    out.push({ id: p.id, status: r.status });
  }
  return out;
}

// ---------- detections ----------

function normDetection(r: Record<string, unknown>): Detection {
  return { ...(r as Detection), created_at: iso(r.created_at)! };
}

export async function listDetections(user: User, opts: { status?: "new" | "done"; limit?: number } = {}): Promise<Detection[]> {
  const st = opts.status === "new" ? `AND d.status = 'new'` : opts.status === "done" ? `AND d.status <> 'new'` : "";
  const rows = await query(
    `SELECT d.id, d.page_id, COALESCE(p.company_name, d.result->>'company_name', '') AS company_name, d.source, d.source_url, d.status, d.schedule_id, d.created_at, d.result
       FROM watch_detections d LEFT JOIN watch_pages p ON p.id = d.page_id
      WHERE ${visible(user, "d", 1)} ${st}
      ORDER BY d.created_at DESC LIMIT ${Math.min(opts.limit ?? 100, 200)}`,
    [user.id],
  );
  return rows.map(normDetection);
}

async function getDetectionFor(user: User, id: number) {
  const row = await queryOne(
    `SELECT d.id, d.page_id, COALESCE(p.company_name, d.result->>'company_name', '') AS company_name, d.source, d.source_url, d.status, d.schedule_id, d.created_at, d.result
       FROM watch_detections d LEFT JOIN watch_pages p ON p.id = d.page_id WHERE d.id = $2 AND ${visible(user, "d", 1)}`,
    [user.id, id],
  );
  if (!row) throw new HttpError(404, "找不到这条识别结果");
  return normDetection(row);
}

export async function setDetectionStatus(user: User, id: number, status: "new" | "dismissed") {
  requireWatch(user);
  const d = await getDetectionFor(user, id);
  if (d.status === "published") throw new HttpError(409, "已经发布了，请到「已发布」里撤回");
  await query(`UPDATE watch_detections SET status = $2 WHERE id = $1`, [id, status]);
}

// ---------- values ----------

type Item = { kind: string; title: string; starts_at: string; location: string };

function toItems(input: ScheduleInputValue): Item[] {
  return input.items
    .map((i) => {
      const at = localToIso(i.starts_at.length === 10 ? `${i.starts_at}T${i.kind === "entry_open" ? "00:00" : "23:59"}` : i.starts_at);
      if (!at) throw new HttpError(400, `日期格式不对：${i.starts_at}`);
      return { kind: i.kind, title: i.title, starts_at: at, location: i.location };
    })
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
}

// ---------- copying into one's own tracker ----------

/** Writes items into the user's own tracker (find / create the company card), skipping events that already exist. */
async function copyToTracker(userId: number, company: string, items: Item[], url: string, origin: string) {
  const companyId = await findOrCreateCompany(userId, company);
  for (const it of items) {
    const exists = await queryOne(`SELECT 1 FROM events WHERE company_id = $1 AND title = $2 AND starts_at = $3`, [companyId, it.title, it.starts_at]);
    if (exists) continue;
    await query(`INSERT INTO events (company_id, kind, title, starts_at, location, prep) VALUES ($1, $2, $3, $4, $5, $6)`, [
      companyId,
      TRACKER_KIND[it.kind] ?? "other",
      it.title,
      it.starts_at,
      it.location || url,
      origin,
    ]);
  }
  const deadline = items.find((i) => i.kind === "deadline" && i.starts_at > new Date().toISOString());
  if (deadline) {
    await query(
      `UPDATE companies SET next_action = $3, next_deadline = $2, updated_at = now()
        WHERE id = $1 AND (next_deadline IS NULL OR next_deadline < now())`,
      [companyId, deadline.starts_at, deadline.title.slice(0, 200)],
    );
  }
  await follow(userId, company);
  return companyId;
}

/** Personal readers: copy a (corrected) reading into their own tracker. */
export async function trackDetection(user: User, detectionId: number, input: ScheduleInputValue) {
  requireWatch(user);
  await getDetectionFor(user, detectionId);
  const items = toItems(input);
  if (!items.length) throw new HttpError(400, "至少需要一项带日期的日程");
  const round = roundText({ round_no: input.round_no ?? null, round_label: input.round_label });
  const companyId = await copyToTracker(user.id, input.company_name, items, input.entry_url, `来自网页监控${round ? ` · ${round}` : ""}`);
  await query(`UPDATE watch_detections SET status = 'tracked' WHERE id = $1 AND status = 'new'`, [detectionId]);
  return { companyId };
}

/** Any user: copy an official schedule into their own tracker. The official copy then leaves their calendar. */
export async function trackOfficial(user: User, scheduleId: number) {
  const s = await getOfficial(scheduleId, user);
  if (!s || s.withdrawn) throw new HttpError(404, "这条官方日程已经撤回了");
  const round = roundText(s);
  const companyId = await copyToTracker(
    user.id,
    s.company_name,
    s.items.map((i) => ({ kind: i.kind, title: i.title, starts_at: i.starts_at, location: i.location })),
    s.entry_url,
    `来自官方选考日程${round ? ` · ${round}` : ""}`,
  );
  await query(
    `INSERT INTO official_tracks (user_id, schedule_id, company_id) VALUES ($1, $2, $3) ON CONFLICT (user_id, schedule_id) DO UPDATE SET company_id = EXCLUDED.company_id`,
    [user.id, scheduleId, companyId],
  );
  return { companyId };
}

// ---------- official schedules ----------

const SCHEDULE_COLS = `s.id, s.company_name, s.company_key, s.grad_year, s.round_no, s.round_label, s.phase, s.entry_url, s.note,
  s.calendar_scope, s.notified, s.withdrawn, s.published_at, s.updated_at`;

async function withItems(rows: Record<string, unknown>[]): Promise<OfficialSchedule[]> {
  const ids = rows.map((r) => Number(r.id));
  const items = ids.length
    ? await query(`SELECT id, schedule_id, kind, title, starts_at, location FROM official_schedule_items WHERE schedule_id = ANY($1::bigint[]) ORDER BY starts_at, position, id`, [ids])
    : [];
  return rows.map((r) => ({
    ...(r as OfficialSchedule),
    published_at: iso(r.published_at)!,
    updated_at: iso(r.updated_at)!,
    items: items
      .filter((i) => Number(i.schedule_id) === Number(r.id))
      .map((i) => ({ id: Number(i.id), kind: i.kind as string, title: i.title as string, starts_at: iso(i.starts_at)!, location: i.location as string })),
  }));
}

/** Who a schedule reaches: everyone, or followers of the company; and only matching 届 (or users without one). */
const AUDIENCE = (s: string, u: string) => `(${s}.grad_year IS NULL OR ${u}.grad_year IS NULL OR ${u}.grad_year = ${s}.grad_year)
  AND (${s}.calendar_scope = 'all' OR EXISTS (SELECT 1 FROM opening_follows f WHERE f.user_id = ${u}.id AND f.company_key = ${s}.company_key))`;

/** For the detail page: admins see any schedule; users only ones addressed to them. */
export async function getOfficial(id: number, user: User): Promise<(OfficialSchedule & { tracked_company_id: number | null }) | null> {
  const row = await queryOne(
    `SELECT ${SCHEDULE_COLS}, t.company_id AS tracked_company_id
       FROM official_schedules s JOIN users u ON u.id = $2
       LEFT JOIN official_tracks t ON t.schedule_id = s.id AND t.user_id = u.id
      WHERE s.id = $1 AND (u.role = 'admin' OR (NOT s.withdrawn AND ${AUDIENCE("s", "u")}))`,
    [id, user.id],
  );
  if (!row) return null;
  const [s] = await withItems([row]);
  return { ...s, tracked_company_id: row.tracked_company_id == null ? null : Number(row.tracked_company_id) };
}

export async function listOfficial(opts: { includeWithdrawn?: boolean } = {}) {
  const rows = await query(`SELECT ${SCHEDULE_COLS} FROM official_schedules s ${opts.includeWithdrawn ? "" : "WHERE NOT s.withdrawn"} ORDER BY s.published_at DESC LIMIT 200`);
  return withItems(rows);
}

function noticeText(s: { company_name: string; grad_year: number | null; round_no: number | null; round_label: string; phase: string }, items: Item[], updated: boolean) {
  const round = roundText(s);
  const gy = s.grad_year ? `${s.grad_year}届 ` : "";
  const what = s.phase === "upcoming" ? "日程公布" : s.phase === "closed" ? "已截止" : "开放了";
  const title = updated ? `【官方】「${s.company_name}」${gy}本选考日程有更新` : `【官方】「${s.company_name}」${gy}本选考${round ? `（${round}）` : ""}${what}`;
  const lines = items.slice(0, 6).map((i) => `${ITEM_KINDS[i.kind]?.label ?? ""}：${formatOpeningDate(i.starts_at)}${i.title && i.title !== ITEM_KINDS[i.kind]?.label ? ` ${i.title}` : ""}`);
  const body = [...lines, items.length > 6 ? `…共 ${items.length} 项` : "", "已自动显示在你的选考日历上（标有「官方」）。可以一键加入自己的选考追踪。"].filter(Boolean).join("\n");
  return { title, body };
}

async function notify(q: Q, scheduleId: number, s: { company_key: string; grad_year: number | null }, mode: "all" | "followers" | "none", text: { title: string; body: string }, actorId: number) {
  if (mode === "none") return 0;
  const link = `/official/${scheduleId}`;
  if (mode === "all") {
    // Site-wide notice: no recipient list is stored, so nothing about individual users is exposed.
    await q(`INSERT INTO announcements (title, body, link, level, audience, created_by) VALUES ($1, $2, $3, 'important', 'all', $4)`, [text.title, text.body, link, actorId]);
    const [r] = await q<{ n: number }>(`SELECT count(*)::int AS n FROM users WHERE status = 'active'`);
    return r.n;
  }
  const [r] = await q<{ n: number }>(
    `WITH target AS (
       SELECT array_agg(f.user_id) AS ids FROM opening_follows f JOIN users u ON u.id = f.user_id
        WHERE f.company_key = $1 AND u.status = 'active' AND ($2::int IS NULL OR u.grad_year IS NULL OR u.grad_year = $2::int)
     ), ins AS (
       INSERT INTO announcements (title, body, link, level, audience, user_ids, created_by)
       SELECT $3, $4, $5, 'important', 'ids', ids, $6 FROM target WHERE ids IS NOT NULL
       RETURNING cardinality(user_ids) AS n
     )
     SELECT COALESCE((SELECT n FROM ins), 0)::int AS n`,
    [s.company_key, s.grad_year, text.title, text.body, link, actorId],
  );
  return r.n;
}

async function writeItems(q: Q, scheduleId: number, items: Item[]) {
  await q(`DELETE FROM official_schedule_items WHERE schedule_id = $1`, [scheduleId]);
  for (const [i, it] of items.entries()) {
    await q(`INSERT INTO official_schedule_items (schedule_id, kind, title, starts_at, location, position) VALUES ($1, $2, $3, $4, $5, $6)`, [
      scheduleId,
      it.kind,
      it.title,
      it.starts_at,
      it.location,
      i,
    ]);
  }
}

function requireAdminUser(user: User) {
  if (user.role !== "admin") throw new HttpError(403, "只有管理员可以发布官方日程");
}

export async function publishSchedule(admin: User, input: ScheduleInputValue, opts: z.infer<typeof PublishOptions>, detectionId?: number | null) {
  requireAdminUser(admin);
  const items = toItems(input);
  if (detectionId) await getDetectionFor(admin, detectionId);
  return transaction(async (q) => {
    if (detectionId) {
      const [d] = await q(`SELECT status FROM watch_detections WHERE id = $1 FOR UPDATE`, [detectionId]);
      if (d?.status === "published") throw new HttpError(409, "这条识别结果已经发布过了");
    }
    const key = companyKey(input.company_name);
    const [row] = await q<{ id: number }>(
      `INSERT INTO official_schedules (company_name, company_key, grad_year, round_no, round_label, phase, entry_url, note, calendar_scope, detection_id, published_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
      [input.company_name, key, input.grad_year ?? null, input.round_no ?? null, input.round_label, input.phase, input.entry_url, input.note, opts.calendar_scope, detectionId ?? null, admin.id],
    );
    await writeItems(q, row.id, items);
    if (detectionId) await q(`UPDATE watch_detections SET status = 'published', schedule_id = $2 WHERE id = $1`, [detectionId, row.id]);
    const notified = await notify(q, row.id, { company_key: key, grad_year: input.grad_year ?? null }, opts.notify, noticeText({ ...input, grad_year: input.grad_year ?? null, round_no: input.round_no ?? null }, items, false), admin.id);
    await q(`UPDATE official_schedules SET notified = $2 WHERE id = $1`, [row.id, notified]);
    return { id: row.id, notified };
  });
}

export async function updateSchedule(admin: User, id: number, input: ScheduleInputValue, opts: z.infer<typeof PublishOptions>) {
  requireAdminUser(admin);
  const items = toItems(input);
  return transaction(async (q) => {
    const [cur] = await q(`SELECT id FROM official_schedules WHERE id = $1 FOR UPDATE`, [id]);
    if (!cur) throw new HttpError(404, "找不到这条官方日程");
    const key = companyKey(input.company_name);
    await q(
      `UPDATE official_schedules SET company_name = $2, company_key = $3, grad_year = $4, round_no = $5, round_label = $6, phase = $7,
              entry_url = $8, note = $9, calendar_scope = $10, updated_at = now() WHERE id = $1`,
      [id, input.company_name, key, input.grad_year ?? null, input.round_no ?? null, input.round_label, input.phase, input.entry_url, input.note, opts.calendar_scope],
    );
    await writeItems(q, id, items);
    const notified = await notify(q, id, { company_key: key, grad_year: input.grad_year ?? null }, opts.notify, noticeText({ ...input, grad_year: input.grad_year ?? null, round_no: input.round_no ?? null }, items, true), admin.id);
    if (notified) await q(`UPDATE official_schedules SET notified = notified + $2 WHERE id = $1`, [id, notified]);
    return { id, notified };
  });
}

export async function setWithdrawn(admin: User, id: number, withdrawn: boolean) {
  requireAdminUser(admin);
  const rows = await query(`UPDATE official_schedules SET withdrawn = $2, updated_at = now() WHERE id = $1 RETURNING id`, [id, withdrawn]);
  if (!rows.length) throw new HttpError(404, "找不到这条官方日程");
}

// ---------- calendars ----------

/**
 * Official items for a user's calendar / dashboard / feed, between two instants.
 * Marked `official` so the UI keeps them apart from the user's own events; schedules the user already copied
 * into their tracker are left out to avoid showing everything twice.
 */
export async function officialItemsFor(userId: number, fromIso: string, toIso: string): Promise<UpcomingItem[]> {
  const rows = await query(
    `SELECT i.id, i.kind, i.title, i.starts_at, i.location, s.id AS schedule_id, s.company_name, s.round_no, s.round_label
       FROM official_schedule_items i
       JOIN official_schedules s ON s.id = i.schedule_id
       JOIN users u ON u.id = $1
      WHERE u.show_official AND NOT s.withdrawn AND i.starts_at >= $2 AND i.starts_at < $3
        AND ${AUDIENCE("s", "u")}
        AND NOT EXISTS (SELECT 1 FROM official_tracks t WHERE t.user_id = u.id AND t.schedule_id = s.id)
      ORDER BY i.starts_at`,
    [userId, fromIso, toIso],
  );
  return rows.map((r) => {
    const round = roundText({ round_no: r.round_no, round_label: r.round_label });
    return {
      key: `o${r.id}`,
      company_id: 0,
      company: r.company_name as string,
      kind: TRACKER_KIND[r.kind as string] ?? "other",
      title: `${r.title}${round ? `（${round}）` : ""}`,
      at: iso(r.starts_at)!,
      location: (r.location as string) || undefined,
      official: true,
      href: `/official/${r.schedule_id}`,
    };
  });
}

/** Same window semantics as data.upcoming(): from the start of today + fromDays to now + toDays. */
export async function officialUpcoming(userId: number, fromDays: number, toDays: number) {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  return officialItemsFor(userId, new Date(start.getTime() + fromDays * 86400000).toISOString(), new Date(Date.now() + toDays * 86400000).toISOString());
}

export async function setShowOfficial(userId: number, show: boolean) {
  await query(`UPDATE users SET show_official = $2 WHERE id = $1`, [userId, show]);
}
