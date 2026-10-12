import "server-only";
import { query, queryOne } from "./db";

export type Announcement = {
  id: number;
  title: string;
  body: string;
  link: string;
  level: "info" | "important";
  created_at: string;
  read: boolean;
};

/** Announcements a user can see: not withdrawn, and either for everyone or addressed to them. */
const VISIBLE = `NOT a.withdrawn AND (a.audience = 'all' OR $1::bigint = ANY(a.user_ids))`;
/**
 * Only announcements sent after the user joined count as unread,
 * so a new account isn't greeted by a pile of old red dots (they can still read them).
 */
const UNREAD = `${VISIBLE} AND a.created_at >= (SELECT created_at FROM users WHERE id = $1)
  AND NOT EXISTS (SELECT 1 FROM announcement_reads r WHERE r.announcement_id = a.id AND r.user_id = $1)`;

export async function listAnnouncements(userId: number, limit = 50): Promise<Announcement[]> {
  const rows = await query(
    `SELECT a.id, a.title, a.body, a.link, a.level, a.created_at,
            (a.created_at < (SELECT created_at FROM users WHERE id = $1)
              OR EXISTS (SELECT 1 FROM announcement_reads r WHERE r.announcement_id = a.id AND r.user_id = $1)) AS read
       FROM announcements a WHERE ${VISIBLE} ORDER BY a.created_at DESC LIMIT ${limit}`,
    [userId],
  );
  return rows.map((r) => ({ ...(r as Announcement), created_at: (r.created_at as Date).toISOString() }));
}

export async function unreadCount(userId: number): Promise<number> {
  const r = await queryOne<{ n: number }>(`SELECT count(*)::int AS n FROM announcements a WHERE ${UNREAD}`, [userId]);
  return r?.n ?? 0;
}

export async function unreadImportant(userId: number): Promise<Announcement[]> {
  const rows = await query(
    `SELECT a.id, a.title, a.body, a.link, a.level, a.created_at, false AS read
       FROM announcements a WHERE ${UNREAD} AND a.level = 'important' ORDER BY a.created_at DESC LIMIT 3`,
    [userId],
  );
  return rows.map((r) => ({ ...(r as Announcement), created_at: (r.created_at as Date).toISOString() }));
}

/** Marks the given (or all visible) announcements as read for the user. */
export async function markRead(userId: number, ids?: number[]) {
  await query(
    `INSERT INTO announcement_reads (announcement_id, user_id)
     SELECT a.id, $1 FROM announcements a
      WHERE ${VISIBLE} ${ids ? "AND a.id = ANY($2::bigint[])" : ""}
     ON CONFLICT DO NOTHING`,
    ids ? [userId, ids] : [userId],
  );
}

/** Safe link targets only: in-app paths or https URLs. */
export function safeLink(link: string) {
  const l = link.trim();
  return l.startsWith("/") && !l.startsWith("//") ? l : /^https:\/\/[^\s]+$/i.test(l) ? l : "";
}
