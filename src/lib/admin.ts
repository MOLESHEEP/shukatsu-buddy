import "server-only";
import { adminEmails, query, queryOne, superAdminEmails } from "./db";
import { getLlmSettings, maskSecret, openSecret } from "./settings";
import { allProviders, providerChain, routing } from "./llm/providers";
import { getDefaultLimits } from "./quota";
import { APP_TZ } from "./time";

const tz = APP_TZ.replace(/'/g, "");
const today = `(date_trunc('day', now() AT TIME ZONE '${tz}') AT TIME ZONE '${tz}')`;

export async function overview() {
  const [counts, ai7, aiByProvider, aiByTask, daily] = await Promise.all([
    queryOne<Record<string, number>>(`
      SELECT
        (SELECT count(*) FROM users)::int AS users,
        (SELECT count(*) FROM users WHERE created_at >= now() - interval '7 days')::int AS users_new_7d,
        (SELECT count(*) FROM users WHERE last_seen_at >= now() - interval '7 days')::int AS users_active_7d,
        (SELECT count(*) FROM users WHERE status = 'banned')::int AS users_banned,
        (SELECT count(*) FROM users WHERE role <> 'admin' AND ai_enabled IS TRUE)::int AS users_ai_on,
        (SELECT count(*) FROM posts WHERE status = 'published')::int AS posts_published,
        (SELECT count(*) FROM posts WHERE status = 'hidden')::int AS posts_hidden,
        (SELECT count(*) FROM post_reports WHERE status = 'open')::int AS reports_open,
        (SELECT count(*) FROM posts WHERE status = 'pending')::int AS posts_pending,
        (SELECT COALESCE(sum(points), 0) FROM users)::int AS points_outstanding,
        (SELECT count(*) FROM feedback WHERE status = 'new')::int AS feedback_new,
        (SELECT count(*) FROM feedback WHERE status IN ('doing', 'accepted'))::int AS feedback_open,
        (SELECT count(*) FROM companies)::int AS companies,
        (SELECT count(*) FROM es_docs)::int AS es_docs`),
    queryOne<{ calls: number; ok: number; today: number }>(`
      SELECT count(*)::int AS calls, count(*) FILTER (WHERE ok)::int AS ok,
             count(*) FILTER (WHERE created_at >= ${today})::int AS today
        FROM ai_usage WHERE created_at >= now() - interval '7 days'`),
    query<{ provider: string; model: string; calls: number; ok: number; avg_ms: number }>(`
      SELECT provider, model, count(*)::int AS calls, count(*) FILTER (WHERE ok)::int AS ok, COALESCE(avg(ms) FILTER (WHERE ok), 0)::int AS avg_ms
        FROM ai_usage WHERE created_at >= now() - interval '30 days'
       GROUP BY provider, model ORDER BY calls DESC`),
    query<{ task: string; calls: number }>(`
      SELECT task, count(*)::int AS calls FROM ai_usage
       WHERE ok AND created_at >= now() - interval '30 days' GROUP BY task ORDER BY calls DESC`),
    query<{ day: string; calls: number }>(`
      SELECT to_char(d, 'MM-DD') AS day, COALESCE(n, 0)::int AS calls
        FROM generate_series((now() AT TIME ZONE '${tz}')::date - 13, (now() AT TIME ZONE '${tz}')::date, interval '1 day') AS d
        LEFT JOIN (SELECT (created_at AT TIME ZONE '${tz}')::date AS day, count(*) AS n FROM ai_usage WHERE ok GROUP BY 1) u ON u.day = d::date
       ORDER BY d`),
  ]);
  return { counts: counts!, ai7: ai7!, aiByProvider, aiByTask, daily };
}

export type AdminUserRow = {
  id: number;
  email: string;
  display_name: string;
  role: string;
  status: string;
  ai_enabled: boolean | null;
  watch_enabled: boolean;
  plan: string;
  grad_year: number | null;
  career_stage: string;
  created_at: string;
  last_seen_at: string | null;
  limit_es: number | null;
  limit_email: number | null;
  limit_post: number | null;
  today_es: number;
  today_email: number;
  today_post: number;
  total_ai: number;
  posts: number;
  points: number;
  role_granted_at: string | null;
  granted_by_email: string | null;
  /** Defined in .env: admin rights can't be changed from the web. */
  env_admin: boolean;
  is_super: boolean;
};

export async function listUsers(q: string, filter: string) {
  const where: string[] = [];
  const params: unknown[] = [];
  if (q) {
    params.push(q);
    where.push(`(u.email ILIKE '%' || $${params.length}::text || '%' OR u.display_name ILIKE '%' || $${params.length}::text || '%' OR u.id::text = $${params.length}::text)`);
  }
  if (filter === "ai_on") where.push(`(u.role = 'admin' OR u.ai_enabled IS TRUE)`);
  if (filter === "ai_off") where.push(`(u.role <> 'admin' AND u.ai_enabled IS NOT TRUE)`);
  if (filter === "banned") where.push(`u.status = 'banned'`);
  if (filter === "admin") where.push(`u.role = 'admin'`);
  if (filter === "watch") where.push(`u.role <> 'admin' AND u.watch_enabled`);
  const since = `GREATEST(${today}, COALESCE(u.quota_reset_at, '-infinity'))`;
  const rows = await query(
    `SELECT u.id, u.email, u.display_name, u.role, u.status, u.ai_enabled, u.watch_enabled, u.plan, u.grad_year, u.career_stage,
            u.created_at, u.last_seen_at, u.limit_es, u.limit_email, u.limit_post,
            (SELECT count(*) FROM ai_usage a WHERE a.user_id = u.id AND a.ok AND a.task = 'es' AND a.created_at >= ${since})::int AS today_es,
            (SELECT count(*) FROM ai_usage a WHERE a.user_id = u.id AND a.ok AND a.task IN ('email', 'reply') AND a.created_at >= ${since})::int AS today_email,
            (SELECT count(*) FROM ai_usage a WHERE a.user_id = u.id AND a.ok AND a.task = 'post' AND a.created_at >= ${since})::int AS today_post,
            (SELECT count(*) FROM ai_usage a WHERE a.user_id = u.id AND a.ok)::int AS total_ai,
            (SELECT count(*) FROM posts p WHERE p.user_id = u.id)::int AS posts, u.points,
            u.role_granted_at, (SELECT g.email FROM users g WHERE g.id = u.role_granted_by) AS granted_by_email
       FROM users u
      ${where.length ? "WHERE " + where.join(" AND ") : ""}
      ORDER BY u.id DESC LIMIT 200`,
    params,
  );
  const envAdmins = adminEmails();
  const supers = superAdminEmails();
  return rows.map((r) => {
    const email = String(r.email).toLowerCase();
    return {
      ...(r as AdminUserRow),
      created_at: (r.created_at as Date).toISOString(),
      last_seen_at: r.last_seen_at ? (r.last_seen_at as Date).toISOString() : null,
      role_granted_at: r.role_granted_at ? (r.role_granted_at as Date).toISOString() : null,
      env_admin: envAdmins.includes(email) || supers.includes(email),
      is_super: r.role === "admin" && supers.includes(email),
    };
  });
}

export type AdminReportRow = {
  id: number;
  post_id: number;
  reason: string;
  detail: string;
  status: string;
  created_at: string;
  reporter_id: number | null;
  reporter_email: string | null;
  post_title: string;
  post_company: string;
  post_status: string;
  author_id: number;
  author_email: string;
  open_reports: number;
};

export async function listReports(status: string) {
  const rows = await query(
    `SELECT r.id, r.post_id, r.reason, r.detail, r.status, r.created_at, r.reporter_id, ru.email AS reporter_email,
            p.title AS post_title, p.company_name AS post_company, p.status AS post_status, p.user_id AS author_id, au.email AS author_email,
            (SELECT count(*) FROM post_reports x WHERE x.post_id = r.post_id AND x.status = 'open')::int AS open_reports
       FROM post_reports r
       JOIN posts p ON p.id = r.post_id
       JOIN users au ON au.id = p.user_id
       LEFT JOIN users ru ON ru.id = r.reporter_id
      WHERE ($1::text = 'all' OR r.status = $1::text)
      ORDER BY r.created_at DESC LIMIT 200`,
    [status],
  );
  return rows.map((r) => ({ ...(r as AdminReportRow), created_at: (r.created_at as Date).toISOString() }));
}

/** Everything the AI settings page needs; API keys only ever leave the server masked. */
export async function llmAdminView() {
  const settings = await getLlmSettings();
  const chain = providerChain(settings).map((p) => p.id);
  const r = routing(settings);
  return {
    primary: settings.primary ?? null,
    fallback: settings.fallback ?? null,
    effectivePrimary: r.primary,
    effectiveFallback: r.fallback,
    envPrimary: process.env.LLM_PROVIDER || "auto",
    envFallback: process.env.LLM_FALLBACK || "",
    aiDefaultEnabled: settings.aiDefaultEnabled,
    limits: await getDefaultLimits(),
    providers: allProviders(settings).map((p) => {
      const o = settings.providers[p.id] ?? {};
      return {
        id: p.id,
        label: p.label,
        vendor: p.vendor,
        protocol: p.protocol,
        needsKey: p.needsKey,
        consoleUrl: p.consoleUrl,
        note: p.note ?? "",
        defaultModel: p.defaultModel,
        defaultBaseUrl: p.defaultBaseUrl,
        keyEnv: p.keyEnvs[0],
        configured: p.configured,
        missing: p.missing,
        model: p.model,
        baseUrl: p.baseUrl,
        keySource: p.keySource,
        keyMasked: maskSecret(p.keySource === "admin" ? openSecret(o.apiKey) : p.apiKey),
        modelOverride: o.model ?? "",
        baseUrlOverride: o.baseUrl ?? "",
        role: chain[0] === p.id ? "primary" : chain.includes(p.id) ? "fallback" : null,
      };
    }),
  };
}
export type LlmAdminView = Awaited<ReturnType<typeof llmAdminView>>;
