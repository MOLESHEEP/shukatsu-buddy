// Client-safe constants and types for 网页监控 / 官方选考日程. Server logic lives in lib/watch.ts.
import { z } from "zod";

/** Admins always may; anyone else only once an admin has opened it for them. */
export function canWatch(user: { role: string; watch_enabled: boolean }) {
  return user.role === "admin" || user.watch_enabled;
}

export const INTERVALS = [6, 12, 24, 48] as const;
/** Limits for users who are not admins. */
export const PERSONAL_LIMITS = { pages: 10, minInterval: 12, aiPerDay: 20 } as const;

export const WATCH_PHASES: Record<string, { label: string; tone: string }> = {
  open: { label: "受付中", tone: "mint" },
  upcoming: { label: "即将开放", tone: "sky" },
  closed: { label: "已截止", tone: "stone" },
  unknown: { label: "看不出来", tone: "stone" },
};

export const ITEM_KINDS: Record<string, { label: string; tone: string }> = {
  entry_open: { label: "エントリー开放", tone: "mint" },
  deadline: { label: "截止", tone: "rose" },
  briefing: { label: "说明会", tone: "sky" },
  test: { label: "笔试", tone: "lemon" },
  interview: { label: "面试", tone: "violet" },
  other: { label: "其他", tone: "stone" },
};

/** Official items map onto the tracker's own event kinds when a user copies them. */
export const TRACKER_KIND: Record<string, string> = {
  entry_open: "other",
  deadline: "deadline",
  briefing: "briefing",
  test: "test",
  interview: "interview",
  other: "other",
};

export function roundText(s: { round_no: number | null; round_label: string }) {
  if (s.round_label) return s.round_label;
  return s.round_no ? `第 ${s.round_no} 次` : "";
}

const localDateTime = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2})?$/, "日期格式应为 YYYY-MM-DD 或 YYYY-MM-DDTHH:mm");

const httpsUrl = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v === "" || /^https?:\/\/[^\s]+$/i.test(v), "链接需要以 http:// 或 https:// 开头")
  .default("");

export const WatchPageInput = z.object({
  company_name: z.string().trim().min(1, "公司必填").max(100),
  url: z
    .string()
    .trim()
    .max(500)
    .regex(/^https?:\/\/[^\s]+$/i, "网址需要以 http:// 或 https:// 开头"),
  grad_year: z.number().int().min(2000).max(2100).nullable().optional(),
  interval_hours: z.number().int().refine((v) => (INTERVALS as readonly number[]).includes(v), "检查频率不对").default(24),
  active: z.boolean().default(true),
});

export const ScheduleItemInput = z.object({
  kind: z.enum(["entry_open", "deadline", "briefing", "test", "interview", "other"]),
  title: z.string().trim().min(1, "日程标题必填").max(120),
  starts_at: localDateTime,
  location: z.string().trim().max(500).default(""),
});

/** What an admin publishes (after checking / correcting the AI reading). Dates are local wall time. */
export const ScheduleInput = z.object({
  company_name: z.string().trim().min(1, "公司必填").max(100),
  grad_year: z.number().int().min(2000).max(2100).nullable().optional(),
  round_no: z.number().int().min(1).max(20).nullable().optional(),
  round_label: z.string().trim().max(60).default(""),
  phase: z.enum(["open", "upcoming", "closed"]),
  entry_url: httpsUrl,
  note: z.string().trim().max(1000).default(""),
  items: z.array(ScheduleItemInput).max(30).default([]),
});

export const PublishOptions = z.object({
  /** Who sees the schedule on their calendar. */
  calendar_scope: z.enum(["all", "followers"]).default("all"),
  /** Who gets an in-app notice now. */
  notify: z.enum(["all", "followers", "none"]).default("all"),
});

export type ScheduleInputValue = z.infer<typeof ScheduleInput>;

export type OfficialItem = { id: number; kind: string; title: string; starts_at: string; location: string };

export type OfficialSchedule = {
  id: number;
  company_name: string;
  company_key: string;
  grad_year: number | null;
  round_no: number | null;
  round_label: string;
  phase: "open" | "upcoming" | "closed";
  entry_url: string;
  note: string;
  calendar_scope: "all" | "followers";
  notified: number;
  withdrawn: boolean;
  published_at: string;
  updated_at: string;
  items: OfficialItem[];
};

export type WatchPage = {
  id: number;
  owner_id: number;
  owner_email: string;
  scope: "admin" | "personal";
  company_name: string;
  url: string;
  grad_year: number | null;
  interval_hours: number;
  active: boolean;
  last_checked_at: string | null;
  last_status: string;
  last_error: string;
  next_check_at: string;
  latest_detection_id: number | null;
};

export type Detection = {
  id: number;
  page_id: number | null;
  company_name: string;
  source: "auto" | "manual" | "paste";
  source_url: string;
  status: "new" | "dismissed" | "published" | "tracked";
  schedule_id: number | null;
  created_at: string;
  result: {
    company_name: string | null;
    is_selection_page: boolean;
    phase: "open" | "upcoming" | "closed" | "unknown";
    grad_year: number | null;
    round_no: number | null;
    round_label: string;
    entry_url: string | null;
    items: { kind: string; title_zh: string; start_local: string; location: string | null }[];
    summary_zh: string;
    evidence_ja: string[];
    confidence: number;
    uncertain_points_zh: string[];
  };
};
