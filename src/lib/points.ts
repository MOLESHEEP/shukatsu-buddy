import "server-only";
import { query, queryOne, transaction } from "./db";
import { HttpError } from "./api";
import type { User } from "./auth";
import { APP_TZ } from "./time";
import { DEFAULT_DAILY_CAP, MARKET_ITEMS, POINTS_PER_POST } from "./points-market";

/**
 * Points (积分): earned when a shared 面试经验 / 工作体验 passes review, spent in the Point Market.
 * users.points is the balance; point_ledger has one row per change. Both are written in one transaction.
 */

type Q = Parameters<Parameters<typeof transaction>[0]>[0];

// ---------- settings ----------

export type PointSettings = {
  /** Max points a user can earn from shared posts per day (APP_TIMEZONE). Super admins only. */
  dailyCap: number;
  /** Let AI review submitted posts; when off (or AI unavailable / unsure) posts wait for an admin. */
  aiReview: boolean;
};

export const DEFAULT_POINT_SETTINGS: PointSettings = { dailyCap: DEFAULT_DAILY_CAP, aiReview: true };

const cache = globalThis as unknown as { pointSettings?: { value: PointSettings; at: number } };

export async function getPointSettings(): Promise<PointSettings> {
  if (cache.pointSettings && Date.now() - cache.pointSettings.at < 15_000) return cache.pointSettings.value;
  const row = await queryOne<{ value: Partial<PointSettings> }>(`SELECT value FROM app_settings WHERE key = 'points'`);
  const value = { ...DEFAULT_POINT_SETTINGS, ...(row?.value ?? {}) };
  cache.pointSettings = { value, at: Date.now() };
  return value;
}

export async function savePointSettings(value: PointSettings) {
  await query(
    `INSERT INTO app_settings (key, value, updated_at) VALUES ('points', $1, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [JSON.stringify(value)],
  );
  cache.pointSettings = { value, at: Date.now() };
}

// ---------- ledger ----------

const tz = APP_TZ.replace(/'/g, "");
const startOfToday = `(date_trunc('day', now() AT TIME ZONE '${tz}') AT TIME ZONE '${tz}')`;

type Change = { userId: number; delta: number; kind: string; item?: string; postId?: number | null; note?: string; actorId?: number | null };

/** Applies one change inside a transaction. A balance can never go below zero. */
async function change(q: Q, c: Change): Promise<number> {
  const rows = await q<{ points: number }>(`UPDATE users SET points = points + $2 WHERE id = $1 AND points + $2 >= 0 RETURNING points`, [c.userId, c.delta]);
  if (!rows.length) throw new HttpError(409, "point 不足");
  const balance = rows[0].points;
  await q(
    `INSERT INTO point_ledger (user_id, delta, kind, item, post_id, note, actor_id, balance_after) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [c.userId, c.delta, c.kind, c.item ?? "", c.postId ?? null, c.note ?? "", c.actorId ?? null, balance],
  );
  return balance;
}

export type RewardResult = { awarded: number; capped: boolean };

/**
 * Rewards the author of an approved post, once per post, within the daily cap.
 * Runs inside the caller's transaction; the post row is locked so a double approval can't pay twice.
 */
export async function rewardPost(q: Q, postId: number): Promise<RewardResult> {
  const [post] = await q<{ user_id: number; reward: string; import_batch: string | null }>(
    `SELECT user_id, reward, import_batch FROM posts WHERE id = $1 FOR UPDATE`,
    [postId],
  );
  if (!post || post.reward || post.import_batch) return { awarded: 0, capped: false };
  // Lock the author so two approvals on the same day can't both slip under the cap.
  await q(`SELECT 1 FROM users WHERE id = $1 FOR UPDATE`, [post.user_id]);
  const [{ earned }] = await q<{ earned: number }>(
    `SELECT COALESCE(sum(delta), 0)::int AS earned FROM point_ledger WHERE user_id = $1 AND kind = 'post_reward' AND created_at >= ${startOfToday}`,
    [post.user_id],
  );
  const { dailyCap } = await getPointSettings();
  if (earned + POINTS_PER_POST > dailyCap) {
    await q(`UPDATE posts SET reward = 'capped' WHERE id = $1`, [postId]);
    return { awarded: 0, capped: true };
  }
  await change(q, { userId: post.user_id, delta: POINTS_PER_POST, kind: "post_reward", postId, note: "经验分享通过审核" });
  await q(`UPDATE posts SET reward = 'awarded' WHERE id = $1`, [postId]);
  return { awarded: POINTS_PER_POST, capped: false };
}

/** Spends one point for an AI use beyond today's free limit. Returns false if the balance is empty. */
export async function spendForAi(userId: number, kind: string): Promise<boolean> {
  const cost = MARKET_ITEMS.find((i) => i.id === "ai_extra")!.cost;
  try {
    await transaction((q) => change(q, { userId, delta: -cost, kind: "ai_extra", item: kind }));
    return true;
  } catch (err) {
    if (err instanceof HttpError && err.status === 409) return false;
    throw err;
  }
}

export async function refundAi(userId: number, kind: string, reason: string) {
  const cost = MARKET_ITEMS.find((i) => i.id === "ai_extra")!.cost;
  await transaction((q) => change(q, { userId, delta: cost, kind: "ai_refund", item: kind, note: reason.slice(0, 200) })).catch((e) =>
    console.error("[points] refund failed", e),
  );
}

/** Super admins only (checked by the route): add or remove points by hand. */
export async function adjustPoints(actorId: number, userId: number, delta: number, note: string) {
  return transaction((q) => change(q, { userId, delta, kind: "admin_adjust", note, actorId }));
}

// ---------- market ----------

/**
 * Handlers for items with mode "redeem". Each runs inside the transaction that deducts the cost,
 * so a failed handler refunds automatically. Return a short message for the user.
 * Example: grant_x: async (q, user) => { await q(`UPDATE users SET ... WHERE id = $1`, [user.id]); return "已兑换"; }
 */
const REDEEMERS: Record<string, (q: Q, user: User) => Promise<string>> = {};

export async function redeem(user: User, itemId: string): Promise<{ message: string; balance: number }> {
  const item = MARKET_ITEMS.find((i) => i.id === itemId);
  const handler = REDEEMERS[itemId];
  if (!item || item.mode !== "redeem" || !handler) throw new HttpError(400, "这个商品暂时不能兑换");
  return transaction(async (q) => {
    const balance = await change(q, { userId: user.id, delta: -item.cost, kind: "redeem", item: item.id, note: item.title }).catch((e) => {
      if (e instanceof HttpError && e.status === 409) throw new HttpError(409, `point 不足：兑换「${item.title}」需要 ${item.cost} 点`);
      throw e;
    });
    return { message: await handler(q, user), balance };
  });
}

// ---------- views ----------

export type LedgerRow = { id: number; delta: number; kind: string; item: string; post_id: number | null; note: string; balance_after: number; created_at: string };

export async function pointSummary(userId: number) {
  const [user, today, pending, settings, history] = await Promise.all([
    queryOne<{ points: number; points_auto_ai: boolean }>(`SELECT points, points_auto_ai FROM users WHERE id = $1`, [userId]),
    queryOne<{ earned: number }>(
      `SELECT COALESCE(sum(delta), 0)::int AS earned FROM point_ledger WHERE user_id = $1 AND kind = 'post_reward' AND created_at >= ${startOfToday}`,
      [userId],
    ),
    queryOne<{ n: number }>(`SELECT count(*)::int AS n FROM posts WHERE user_id = $1 AND status = 'pending'`, [userId]),
    getPointSettings(),
    query(
      `SELECT id, delta, kind, item, post_id, note, balance_after, created_at FROM point_ledger WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT 50`,
      [userId],
    ),
  ]);
  return {
    balance: user?.points ?? 0,
    autoAi: user?.points_auto_ai ?? true,
    earnedToday: today?.earned ?? 0,
    dailyCap: settings.dailyCap,
    pendingPosts: pending?.n ?? 0,
    history: history.map((r) => ({ ...(r as LedgerRow), created_at: (r.created_at as Date).toISOString() })),
  };
}
export type PointSummary = Awaited<ReturnType<typeof pointSummary>>;
