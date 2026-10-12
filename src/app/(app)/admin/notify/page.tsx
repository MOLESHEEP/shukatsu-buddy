import { query, queryOne } from "@/lib/db";
import { NotifyAdmin, type SentRow } from "./notify-admin";

export default async function AdminNotify() {
  const [rows, active] = await Promise.all([
    query(
      `SELECT a.id, a.title, a.body, a.link, a.level, a.audience, a.user_ids, a.withdrawn, a.created_at,
              (SELECT count(*) FROM announcement_reads r WHERE r.announcement_id = a.id)::int AS reads,
              CASE WHEN a.audience = 'all'
                   THEN (SELECT count(*) FROM users u WHERE u.status = 'active' AND u.created_at <= a.created_at)
                   ELSE cardinality(a.user_ids) END::int AS reach
         FROM announcements a ORDER BY a.created_at DESC LIMIT 100`,
    ),
    queryOne<{ n: number }>(`SELECT count(*)::int AS n FROM users WHERE status = 'active'`),
  ]);
  const sent = rows.map((r) => ({ ...(r as SentRow), created_at: (r.created_at as Date).toISOString() }));
  return <NotifyAdmin sent={sent} activeUsers={active?.n ?? 0} />;
}
