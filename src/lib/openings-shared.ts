// Client-safe helpers for 本选考开放通知. Server logic lives in lib/openings.ts.
import { z } from "zod";
import { isoToLocalInput } from "./time";

/**
 * Normalised company name used to match follows, reports and records:
 * full-width → half-width (NFKC), no 株式会社 / (株) / spaces / punctuation, lower case.
 * "株式会社 ＡＢＣ商事" and "ABC商事(株)" both become "abc商事".
 */
export function companyKey(name: string): string {
  const n = name.normalize("NFKC");
  const key = n
    .replace(/株式会社|有限会社|合同会社|\(株\)|\(有\)/g, "")
    .replace(/[\s・.,，、。'"’”-]/g, "")
    .toLowerCase();
  return key || n.replace(/\s/g, "").toLowerCase();
}

export type Opening = {
  id: number;
  company_name: string;
  company_key: string;
  grad_year: number | null;
  opens_at: string | null;
  deadline: string | null;
  url: string;
  note: string;
  source: "admin" | "user";
  /** Shown only when the reporter turned anonymity off. */
  reporter_name: string | null;
  following: boolean;
  updated_at: string;
};

export type OpeningPhase = "upcoming" | "open" | "closed";

export function openingPhase(o: Pick<Opening, "opens_at" | "deadline">, now = Date.now()): OpeningPhase {
  if (o.deadline && Date.parse(o.deadline) < now) return "closed";
  if (o.opens_at && Date.parse(o.opens_at) > now) return "upcoming";
  return "open";
}

export const PHASES: Record<OpeningPhase, { label: string; tone: string }> = {
  open: { label: "受付中", tone: "mint" },
  upcoming: { label: "即将开放", tone: "sky" },
  closed: { label: "已截止", tone: "stone" },
};

const weekday = ["日", "一", "二", "三", "四", "五", "六"];

/** "10月1日(周三)" plus the time unless it is a whole-day value (00:00 / 23:59). */
export function formatOpeningDate(iso: string | null): string {
  if (!iso) return "";
  const local = isoToLocalInput(iso);
  const d = new Date(local.slice(0, 10) + "T00:00:00Z");
  const hm = local.slice(11, 16);
  const time = hm === "00:00" || hm === "23:59" ? "" : ` ${hm}`;
  return `${local.slice(0, 4)}年${d.getUTCMonth() + 1}月${d.getUTCDate()}日(周${weekday[d.getUTCDay()]})${time}`;
}

/** For <input type="date"> / datetime-local: date only when the time is a whole-day value. */
export function toDateInput(iso: string | null): string {
  if (!iso) return "";
  const local = isoToLocalInput(iso);
  const hm = local.slice(11, 16);
  return hm === "00:00" || hm === "23:59" ? local.slice(0, 10) : local;
}

const localDate = z
  .string()
  .trim()
  .max(20)
  .refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2})?$/.test(v), "日期格式应为 YYYY-MM-DD")
  .nullable()
  .optional()
  .transform((v) => v || null);

const httpsUrl = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v === "" || /^https:\/\/[^\s]+$/i.test(v), "链接需要以 https:// 开头")
  .default("");

/** Record fields shared by user reports and admin entry. Dates are local wall time (APP_TIMEZONE). */
export const OpeningFields = z.object({
  company_name: z.string().trim().min(1, "公司必填").max(100),
  grad_year: z.number().int().min(2000).max(2100).nullable().optional(),
  opens_at: localDate,
  deadline: localDate,
  url: httpsUrl,
  note: z.string().trim().max(500).default(""),
});

const needsDate = (v: { opens_at?: string | null; deadline?: string | null }) => Boolean(v.opens_at || v.deadline);
const dateMsg = { message: "开放时间和截止时间至少填一个", path: ["opens_at"] };

export const OpeningInput = OpeningFields.refine(needsDate, dateMsg);

export const OpeningReportInput = OpeningFields.extend({
  /** public: reviewed, then shared with followers. private: only written to the reporter's own tracker. */
  visibility: z.enum(["public", "private"]),
  anonymous: z.boolean().default(true),
  add_to_tracker: z.boolean().default(true),
  /** Set when correcting / supplementing an existing record. */
  opening_id: z.number().int().positive().nullable().optional(),
}).refine(needsDate, dateMsg);

export type OpeningFieldsValue = z.infer<typeof OpeningFields>;
