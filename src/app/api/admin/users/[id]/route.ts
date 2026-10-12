import { z } from "zod";
import { HttpError, idParam, readJson, withAdmin } from "@/lib/api";
import { query, queryOne } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

const limit = z.number().int().min(0).max(1000).nullable();

const Patch = z.object({
  status: z.enum(["active", "banned"]).optional(),
  /** true / false = explicit switch, null = follow the site default */
  ai_enabled: z.boolean().nullable().optional(),
  plan: z.enum(["free", "pro"]).optional(),
  limit_es: limit.optional(),
  limit_email: limit.optional(),
  limit_post: limit.optional(),
  reset_today: z.boolean().optional(),
});

export const PATCH = withAdmin<Ctx>(async (req, admin, { params }) => {
  const id = idParam((await params).id);
  const target = await queryOne<{ role: string }>(`SELECT role FROM users WHERE id = $1`, [id]);
  if (!target) throw new HttpError(404, "找不到这个用户");
  const b = await readJson(req, Patch);
  if (b.status === "banned" && (target.role === "admin" || id === admin.id)) throw new HttpError(400, "不能停用管理员账号");

  const sets: string[] = [];
  const vals: unknown[] = [id];
  const set = (col: string, v: unknown) => {
    vals.push(v);
    sets.push(`${col} = $${vals.length}`);
  };
  if (b.status !== undefined) set("status", b.status);
  if (b.ai_enabled !== undefined) set("ai_enabled", b.ai_enabled);
  if (b.plan !== undefined) set("plan", b.plan);
  if (b.limit_es !== undefined) set("limit_es", b.limit_es);
  if (b.limit_email !== undefined) set("limit_email", b.limit_email);
  if (b.limit_post !== undefined) set("limit_post", b.limit_post);
  if (b.reset_today) sets.push("quota_reset_at = now()");
  if (sets.length) await query(`UPDATE users SET ${sets.join(", ")} WHERE id = $1`, vals);
  return { ok: true };
});
