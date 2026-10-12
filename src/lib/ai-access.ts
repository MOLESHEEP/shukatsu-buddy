import "server-only";
import { HttpError } from "./api";
import type { User } from "./auth";
import { getLlmSettings } from "./settings";
import { isDemoMode } from "./llm/provider";

/**
 * Whether this user may call real AI. Admins always can; otherwise the per-user switch wins,
 * falling back to the site default. Demo mode costs nothing, so everyone may use it.
 */
export async function aiAccess(user: User): Promise<{ allowed: boolean; demo: boolean }> {
  const demo = await isDemoMode();
  if (demo || user.role === "admin") return { allowed: true, demo };
  if (user.ai_enabled != null) return { allowed: user.ai_enabled, demo };
  return { allowed: (await getLlmSettings()).aiDefaultEnabled, demo };
}

export async function requireAi(user: User) {
  const { allowed } = await aiAccess(user);
  if (!allowed) throw new HttpError(403, `你的账号还没有开通 AI 功能，请把你的用户 ID（${user.id}）发给管理员开通`);
}
