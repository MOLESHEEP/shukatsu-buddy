import "server-only";
import { query, queryOne } from "./db";
import type { Post } from "./community";

// `notes` (the author's private rough description) is deliberately never selected here.
const COLUMNS = `
  p.id, p.user_id, p.kind, p.status, p.company_name, p.industry, p.role,
  to_char(p.occurred_on, 'YYYY-MM') AS occurred_on, to_char(p.ended_on, 'YYYY-MM') AS ended_on,
  p.grad_year, p.stage, p.result, p.employment_type, p.rating, p.title, p.body, p.tags, p.anonymous,
  p.created_at, p.updated_at, p.published_at,
  CASE WHEN p.anonymous THEN '' ELSE u.display_name END AS author,
  (SELECT count(*) FROM post_votes v WHERE v.post_id = p.id)::int AS votes,
  EXISTS (SELECT 1 FROM post_votes v WHERE v.post_id = p.id AND v.user_id = $1) AS voted`;

function norm(r: Record<string, unknown>): Post {
  return {
    ...(r as unknown as Post),
    id: Number(r.id),
    user_id: Number(r.user_id),
    created_at: (r.created_at as Date).toISOString(),
    updated_at: (r.updated_at as Date).toISOString(),
    published_at: r.published_at ? (r.published_at as Date).toISOString() : null,
  };
}

export type FeedFilter = { kind?: string; q?: string; year?: number; sort?: "recent" | "helpful" };

export async function listFeed(viewerId: number, f: FeedFilter, limit = 50) {
  const where = [`p.status = 'published'`];
  const params: unknown[] = [viewerId];
  if (f.kind === "interview" || f.kind === "work") {
    params.push(f.kind);
    where.push(`p.kind = $${params.length}`);
  }
  if (f.q) {
    params.push(f.q);
    const i = `${params.length}::text`;
    where.push(`(p.company_name ILIKE '%' || $${i} || '%' OR p.industry ILIKE '%' || $${i} || '%' OR p.role ILIKE '%' || $${i} || '%' OR $${i} = ANY(p.tags))`);
  }
  if (f.year) {
    // Work posts match any year they cover; interview posts match the interview year.
    params.push(f.year);
    const i = `${params.length}::int`;
    where.push(`(extract(year FROM p.occurred_on) = $${i} OR (p.kind = 'work' AND extract(year FROM p.occurred_on) <= $${i} AND COALESCE(extract(year FROM p.ended_on), 9999) >= $${i}))`);
  }
  const order = f.sort === "helpful" ? "votes DESC, p.occurred_on DESC" : "COALESCE(p.ended_on, current_date) DESC, p.occurred_on DESC, p.published_at DESC";
  const rows = await query(`SELECT ${COLUMNS} FROM posts p JOIN users u ON u.id = p.user_id WHERE ${where.join(" AND ")} ORDER BY ${order} LIMIT ${limit}`, params);
  return rows.map(norm);
}

export async function listMine(userId: number) {
  const rows = await query(`SELECT ${COLUMNS} FROM posts p JOIN users u ON u.id = p.user_id WHERE p.user_id = $1 ORDER BY p.updated_at DESC`, [userId]);
  return rows.map(norm);
}

/** A published post, or the viewer's own draft. */
export async function getPost(viewerId: number, id: number) {
  const row = await queryOne(
    `SELECT ${COLUMNS} FROM posts p JOIN users u ON u.id = p.user_id WHERE p.id = $2 AND (p.status = 'published' OR p.user_id = $1)`,
    [viewerId, id],
  );
  return row ? norm(row) : null;
}

export async function getOwnPostWithNotes(userId: number, id: number) {
  const post = await getPost(userId, id);
  if (!post || post.user_id !== userId) return null;
  const n = await queryOne<{ notes: string }>(`SELECT notes FROM posts WHERE id = $1`, [id]);
  return { post, notes: n?.notes ?? "" };
}

/** Community posts about a company in the user's tracker (fuzzy name match). */
export async function postsForCompany(viewerId: number, companyName: string, limit = 5) {
  const clean = companyName.replace(/株式会社|（株）|\(株\)/g, "").trim() || companyName;
  const rows = await query(
    `SELECT ${COLUMNS} FROM posts p JOIN users u ON u.id = p.user_id
      WHERE p.status = 'published'
        AND (p.company_name ILIKE '%' || $2::text || '%'
             OR (length(replace(replace(p.company_name, '株式会社', ''), '（株）', '')) > 1
                 AND $3::text ILIKE '%' || replace(replace(p.company_name, '株式会社', ''), '（株）', '') || '%'))
      ORDER BY p.occurred_on DESC LIMIT ${limit}`,
    [viewerId, clean, companyName],
  );
  return rows.map(norm);
}
