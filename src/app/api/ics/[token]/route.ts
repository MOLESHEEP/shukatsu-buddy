import { queryOne } from "@/lib/db";
import { upcoming } from "@/lib/data";
import { EVENT_KINDS, TEST_TYPES } from "@/lib/constants";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ token: string }> };

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const stamp = (iso: string) => iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/**
 * Private calendar feed. Subscribe from iPhone / Google Calendar to get the PRD reminders
 * (3 days and 1 day before deadlines, the evening before interviews) as native notifications.
 */
export async function GET(_req: Request, { params }: Ctx) {
  const { token } = await params;
  const user = await queryOne<{ id: string }>(`SELECT id FROM users WHERE ics_token = $1`, [token.replace(/\.ics$/, "")]);
  if (!user) return new Response("Not found", { status: 404 });

  const items = await upcoming(Number(user.id), -60, 365);
  const now = stamp(new Date().toISOString());
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//shukatsu-buddy//CN", "CALSCALE:GREGORIAN", "X-WR-CALNAME:就活日程"];
  for (const it of items) {
    const start = stamp(new Date(it.at).toISOString());
    const end = stamp(new Date(new Date(it.at).getTime() + 60 * 60000).toISOString());
    const label = EVENT_KINDS[it.kind]?.label ?? "";
    const title = it.kind === "test" && it.title === "笔试受检期限" ? `笔试期限（${TEST_TYPES[(it as { type?: keyof typeof TEST_TYPES }).type ?? "unknown"]?.label ?? ""}）` : it.title;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${it.key}@shukatsu-buddy`,
      `DTSTAMP:${now}`,
      `DTSTART:${start}`,
      `DTEND:${end}`,
      `SUMMARY:${esc(`【${label}】${it.company} ${title}`)}`,
      ...(it.location ? [`LOCATION:${esc(it.location)}`] : []),
      ...(it.prep ? [`DESCRIPTION:${esc("准备：" + it.prep)}`] : []),
    );
    const alarms = it.kind === "interview" || it.kind === "briefing" ? ["-PT12H"] : ["-P3D", "-P1D"];
    for (const trigger of alarms) {
      lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${esc(`${it.company} ${title}`)}`, `TRIGGER:${trigger}`, "END:VALARM");
    }
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return new Response(lines.join("\r\n"), {
    headers: { "content-type": "text/calendar; charset=utf-8", "cache-control": "no-store" },
  });
}
