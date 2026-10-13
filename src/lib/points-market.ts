// Client-safe catalogue for the Point Market. Server-side effects live in lib/points.ts (REDEEMERS).

/**
 * - auto:   spent automatically by a feature (no button); the card explains how it works.
 * - redeem: the user exchanges points on the market page; needs a handler in REDEEMERS (lib/points.ts).
 * - soon:   shown as "即将上线" so users know points will have more uses.
 */
export type MarketItem = {
  id: string;
  emoji: string;
  title: string;
  description: string;
  cost: number;
  mode: "auto" | "redeem" | "soon";
};

export const MARKET_ITEMS: MarketItem[] = [
  {
    id: "ai_extra",
    emoji: "✨",
    title: "AI 额外次数",
    description: "今天的免费次数用完后，ES 添削、邮件助手、经验整理每多用 1 次自动扣 1 点。AI 调用失败会自动退还。",
    cost: 1,
    mode: "auto",
  },
];

export const POINT_KINDS: Record<string, { label: string; tone: string }> = {
  post_reward: { label: "分享通过审核", tone: "mint" },
  ai_extra: { label: "AI 额外次数", tone: "violet" },
  ai_refund: { label: "AI 调用失败退还", tone: "sky" },
  admin_adjust: { label: "管理员调整", tone: "lemon" },
  redeem: { label: "兑换", tone: "sakura" },
};

export const AI_ITEM_LABELS: Record<string, string> = { es: "ES 添削", email: "邮件助手", post: "经验整理" };

/** Default rules; the daily cap can be changed by a super admin. */
export const POINTS_PER_POST = 1;
export const DEFAULT_DAILY_CAP = 5;
