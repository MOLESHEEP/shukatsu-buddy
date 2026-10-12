import { HttpError, idParam, withAdmin } from "@/lib/api";
import { queryOne } from "@/lib/db";
import { createResetLink } from "@/lib/password-reset";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Admin-assisted password reset: returns a one-time link (valid 24h) for the admin to send to the user
 * through any channel. Works without SMTP. Not available for other admin accounts.
 */
export const POST = withAdmin<Ctx>(async (_req, admin, { params }) => {
  const id = idParam((await params).id);
  const target = await queryOne<{ role: string; status: string; email: string }>(`SELECT role, status, email FROM users WHERE id = $1`, [id]);
  if (!target) throw new HttpError(404, "找不到这个用户");
  if (target.role === "admin" && id !== admin.id) throw new HttpError(403, "不能为其他管理员生成重置链接");
  if (target.status !== "active") throw new HttpError(400, "账号已停用，请先恢复账号");
  const link = await createResetLink(id, "admin", 24 * 60);
  return { link, email: target.email, expiresInHours: 24 };
});
