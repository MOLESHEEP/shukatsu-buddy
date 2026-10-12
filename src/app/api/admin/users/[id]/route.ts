import { z } from "zod";
import { HttpError, idParam, readJson, withAdmin } from "@/lib/api";
import { adminEmails, query, queryOne, superAdminEmails, transaction } from "@/lib/db";

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
  /** Super admins only: grant or revoke admin rights. */
  role: z.enum(["admin", "user"]).optional(),
});

export const PATCH = withAdmin<Ctx>(async (req, admin, { params }) => {
  const id = idParam((await params).id);
  const target = await queryOne<{ role: string; status: string; email: string }>(`SELECT role, status, email FROM users WHERE id = $1`, [id]);
  if (!target) throw new HttpError(404, "找不到这个用户");
  const b = await readJson(req, Patch);
  const email = target.email.toLowerCase();

  if (b.role !== undefined && b.role !== target.role) {
    if (!admin.is_super) throw new HttpError(403, "只有超级管理员可以授予或取消管理员权限");
    if (id === admin.id) throw new HttpError(400, "不能修改自己的权限");
    if (b.role === "user" && (superAdminEmails().includes(email) || adminEmails().includes(email))) {
      throw new HttpError(400, "这是服务器配置（.env）里的管理员，只能在服务器上修改");
    }
    if (b.role === "admin" && target.status !== "active") throw new HttpError(400, "账号已停用，请先恢复账号");
    await transaction(async (q) => {
      await q(`UPDATE users SET role = $2, role_granted_by = $3, role_granted_at = now() WHERE id = $1`, [id, b.role, admin.id]);
      // Let the person know: a direct notice only they can see.
      await q(
        `INSERT INTO announcements (title, body, link, level, audience, user_ids, created_by) VALUES ($1, $2, $3, 'important', 'ids', ARRAY[$4::bigint], $5)`,
        b.role === "admin"
          ? ["你已被设为管理员", "侧边栏出现了「管理后台」，可以管理用户、内容和 AI 设置。请妥善使用权限。", "/admin", id, admin.id]
          : ["你的管理员权限已被取消", "你现在是普通用户。如有疑问请联系超级管理员。", "", id, admin.id],
      );
    });
  }

  if (b.status === "banned" && (target.role === "admin" || id === admin.id)) throw new HttpError(400, "不能停用管理员账号，请先取消其管理员权限");

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
