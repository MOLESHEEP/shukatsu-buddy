// Timezone helpers. Dates from Japanese emails are local (Asia/Tokyo by default).

export const APP_TZ = process.env.APP_TIMEZONE || process.env.NEXT_PUBLIC_APP_TIMEZONE || "Asia/Tokyo";

function tzOffsetMinutes(date: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return (asUtc - date.getTime()) / 60000;
}

/** "2027-03-05T14:00" (wall time in tz) -> ISO string, or null if unparseable. */
export function localToIso(local: string | null | undefined, tz = APP_TZ): string | null {
  if (!local) return null;
  const m = local.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if (!m) return null;
  const [, y, mo, d, h = "23", mi = "59"] = m;
  const guess = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi));
  if (Number.isNaN(guess.getTime())) return null;
  const offset = tzOffsetMinutes(guess, tz);
  return new Date(guess.getTime() - offset * 60000).toISOString();
}

/** ISO -> "YYYY-MM-DDTHH:mm" in tz, for <input type="datetime-local">. */
export function isoToLocalInput(iso: string | Date | null | undefined, tz = APP_TZ): string {
  if (!iso) return "";
  const date = typeof iso === "string" ? new Date(iso) : iso;
  const shifted = new Date(date.getTime() + tzOffsetMinutes(date, tz) * 60000);
  return shifted.toISOString().slice(0, 16);
}

export function todayLocal(tz = APP_TZ): string {
  return isoToLocalInput(new Date(), tz).slice(0, 10);
}

const weekday = ["日", "一", "二", "三", "四", "五", "六"];

export function formatDateTime(iso: string | Date | null | undefined, tz = APP_TZ): string {
  if (!iso) return "";
  const local = isoToLocalInput(iso, tz);
  const d = new Date(local + ":00Z");
  const hm = local.slice(11, 16);
  return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日(周${weekday[d.getUTCDay()]}) ${hm === "23:59" ? "" : hm}`.trim();
}

export function daysUntil(iso: string | Date, tz = APP_TZ): number {
  const target = isoToLocalInput(iso, tz).slice(0, 10);
  const today = todayLocal(tz);
  return Math.round((Date.parse(target) - Date.parse(today)) / 86400000);
}
