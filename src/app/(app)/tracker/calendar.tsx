import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Card, cx, toneDot, type Tone } from "@/components/ui";
import { EVENT_KINDS } from "@/lib/constants";
import { isoToLocalInput, todayLocal } from "@/lib/time";
import type { UpcomingItem } from "@/lib/data";
import { UpcomingList } from "@/components/upcoming-list";

function shift(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function MonthCalendar({ month, items }: { month: string; items: UpcomingItem[] }) {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = first.getUTCDay(); // Sunday-first like Japanese calendars
  const today = todayLocal();

  const byDay = new Map<number, UpcomingItem[]>();
  for (const it of items) {
    const day = Number(isoToLocalInput(it.at).slice(8, 10));
    byDay.set(day, [...(byDay.get(day) ?? []), it]);
  }
  const cells = [...Array(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);

  return (
    <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
      <Card className="p-3 sm:p-5">
        <div className="mb-3 flex items-center justify-between">
          <Link href={`/tracker?view=calendar&month=${shift(month, -1)}`} className="rounded-full p-2 text-muted hover:bg-stone-50" aria-label="上个月">
            <ChevronLeft className="size-5" />
          </Link>
          <h2 className="font-semibold">
            {y} 年 {m} 月
          </h2>
          <Link href={`/tracker?view=calendar&month=${shift(month, 1)}`} className="rounded-full p-2 text-muted hover:bg-stone-50" aria-label="下个月">
            <ChevronRight className="size-5" />
          </Link>
        </div>
        <div className="grid grid-cols-7 text-center text-xs text-muted">
          {["日", "一", "二", "三", "四", "五", "六"].map((d, i) => (
            <div key={d} className={cx("pb-2", i === 0 && "text-sakura-500", i === 6 && "text-sky-500")}>
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((day, i) => {
            const list = day ? byDay.get(day) ?? [] : [];
            const isToday = day && `${month}-${String(day).padStart(2, "0")}` === today;
            return (
              <div key={i} className={cx("min-h-16 rounded-xl p-1 text-left sm:min-h-24 sm:p-1.5", day ? "bg-cream" : "", isToday && "ring-2 ring-sakura-300")}>
                {day && (
                  <>
                    <div className={cx("text-xs tabular-nums", isToday ? "font-bold text-sakura-600" : "text-muted")}>{day}</div>
                    <div className="mt-0.5 space-y-0.5">
                      {list.slice(0, 3).map((it) => {
                        const tone = (EVENT_KINDS[it.kind]?.tone ?? "stone") as Tone;
                        return (
                          <Link
                            key={it.key}
                            href={it.href ?? `/tracker/${it.company_id}`}
                            title={`${it.official ? "【官方】" : ""}${it.company} ${it.title}`}
                            className={cx(
                              "flex items-center gap-1 truncate rounded-md px-1 py-0.5 text-[10px] leading-tight sm:text-[11px]",
                              it.official ? "bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-100 hover:bg-violet-100" : "bg-paper hover:bg-sakura-50",
                            )}
                          >
                            {it.official ? <span className="shrink-0 font-semibold">官</span> : <span className={cx("size-1.5 shrink-0 rounded-full", toneDot[tone])} />}
                            <span className="truncate">{it.company.replace(/株式会社|（株）|\(株\)/g, "").trim() || it.company}</span>
                          </Link>
                        );
                      })}
                      {list.length > 3 && <div className="px-1 text-[10px] text-muted">+{list.length - 3}</div>}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </Card>
      <Card>
        <h2 className="mb-2 font-semibold">本月日程</h2>
        {items.length ? <UpcomingList items={items} /> : <p className="py-6 text-center text-sm text-muted">这个月还没有日程</p>}
      </Card>
    </div>
  );
}
