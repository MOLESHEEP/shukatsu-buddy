import { z } from "zod";
import { HttpError, readJson, withAdmin } from "@/lib/api";
import { query, queryOne } from "@/lib/db";
import { safeLink } from "@/lib/notifications";

const Body = z.object({
  title: z.string().trim().min(1, "标题必填").max(80, "标题最多 80 字"),
  body: z.string().trim().max(3000).default(""),
  link: z.string().trim().max(300).default(""),
  level: z.enum(["info", "important"]).default("info"),
  audience: z.enum(["all", "ids"]).default("all"),
  user_ids: z.array(z.number().int().positive()).max(1000).default([]),
});

/** Send an announcement to every user, or to specific user IDs. */
export const POST = withAdmin(async (req, admin) => {
  const b = await readJson(req, Body);
  const link = safeLink(b.link);
  if (b.link && !link) throw new HttpError(400, "链接需以 / 开头（站内页面）或 https:// 开头");
  let ids: number[] = [];
  if (b.audience === "ids") {
    if (!b.user_ids.length) throw new HttpError(400, "请填写至少一个用户 ID");
    const found = await query<{ id: number }>(`SELECT id FROM users WHERE id = ANY($1::bigint[])`, [b.user_ids]);
    const missing = b.user_ids.filter((id) => !found.some((f) => f.id === id));
    if (missing.length) throw new HttpError(400, `找不到这些用户 ID：${missing.join("、")}`);
    ids = found.map((f) => f.id);
  }
  const row = await queryOne<{ id: number }>(
    `INSERT INTO announcements (title, body, link, level, audience, user_ids, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [b.title, b.body, link, b.level, b.audience, ids, admin.id],
  );
  const reach = b.audience === "all" ? (await queryOne<{ n: number }>(`SELECT count(*)::int AS n FROM users WHERE status = 'active'`))!.n : ids.length;
  return { id: row!.id, reach };
});
