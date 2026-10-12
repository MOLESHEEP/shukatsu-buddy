// Client-safe constants for 意见反馈.

export const FEEDBACK_CATEGORIES: Record<string, { label: string; emoji: string }> = {
  idea: { label: "功能建议", emoji: "💡" },
  bug: { label: "问题反馈", emoji: "🐞" },
  content: { label: "内容相关", emoji: "📝" },
  other: { label: "其他", emoji: "💬" },
};

export const FEEDBACK_STATUS: Record<string, { label: string; tone: string }> = {
  new: { label: "待处理", tone: "rose" },
  doing: { label: "处理中", tone: "lemon" },
  accepted: { label: "已采纳", tone: "violet" },
  done: { label: "已完成", tone: "mint" },
  closed: { label: "已关闭", tone: "stone" },
};

export const FEEDBACK_DAILY_LIMIT = 10;

export type FeedbackRow = {
  id: number;
  user_id: number | null;
  category: string;
  content: string;
  page: string;
  status: string;
  reply: string;
  replied_at: string | null;
  reply_seen: boolean;
  created_at: string;
  updated_at: string;
  user_email?: string | null;
  user_name?: string | null;
};
