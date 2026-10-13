import { z } from "zod";
import { HttpError, readJson, withAdmin } from "@/lib/api";
import { queryOne } from "@/lib/db";
import { adjustPoints, getPointSettings, savePointSettings } from "@/lib/points";

export const GET = withAdmin(async () => getPointSettings());

const Put = z.object({
  /** Super admins only. */
  dailyCap: z.number().int().min(0).max(100).optional(),
  aiReview: z.boolean().optional(),
});

export const PUT = withAdmin(async (req, admin) => {
  const b = await readJson(req, Put);
  const s = await getPointSettings();
  if (b.dailyCap !== undefined && b.dailyCap !== s.dailyCap && !admin.is_super) {
    throw new HttpError(403, "只有超级管理员可以修改每日获得 point 的上限");
  }
  const next = { ...s, ...(b.dailyCap !== undefined ? { dailyCap: b.dailyCap } : {}), ...(b.aiReview !== undefined ? { aiReview: b.aiReview } : {}) };
  await savePointSettings(next);
  return next;
});

const Adjust = z.object({
  user_id: z.number().int().positive(),
  delta: z.number().int().min(-10000).max(10000).refine((v) => v !== 0, "调整数不能为 0"),
  note: z.string().trim().min(1, "请写明原因").max(200),
});

/** Super admins only: add or remove a user's points by hand (always logged with the reason). */
export const POST = withAdmin(async (req, admin) => {
  if (!admin.is_super) throw new HttpError(403, "只有超级管理员可以调整用户的 point");
  const b = await readJson(req, Adjust);
  const exists = await queryOne(`SELECT 1 FROM users WHERE id = $1`, [b.user_id]);
  if (!exists) throw new HttpError(404, "找不到这个用户");
  const balance = await adjustPoints(admin.id, b.user_id, b.delta, b.note).catch((e) => {
    if (e instanceof HttpError && e.status === 409) throw new HttpError(400, "扣除后余额不能小于 0");
    throw e;
  });
  return { balance };
});
