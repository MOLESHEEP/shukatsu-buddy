import Link from "next/link";
import { Badge, toneDot, cx, type Tone } from "./ui";
import { EVENT_KINDS } from "@/lib/constants";
import { daysUntil, formatDateTime } from "@/lib/time";
import type { UpcomingItem } from "@/lib/data";

export function dueLabel(iso: string) {
  const d = daysUntil(iso);
  if (d < 0) return { text: `已过 ${-d} 天`, tone: "stone" as Tone };
  if (d === 0) return { text: "今天", tone: "rose" as Tone };
  if (d === 1) return { text: "明天", tone: "rose" as Tone };
  if (d <= 3) return { text: `${d} 天后`, tone: "lemon" as Tone };
  return { text: `${d} 天后`, tone: "sky" as Tone };
}

export function UpcomingList({ items }: { items: UpcomingItem[] }) {
  return (
    <ul className="divide-y divide-line">
      {items.map((it) => {
        const kind = EVENT_KINDS[it.kind] ?? EVENT_KINDS.other;
        const due = dueLabel(it.at);
        return (
          <li key={it.key}>
            <Link href={it.href ?? `/tracker/${it.company_id}`} className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-3 transition hover:bg-stone-50">
              <span className={cx("size-2.5 shrink-0 rounded-full", toneDot[kind.tone as Tone])} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">
                  {it.official && (
                    <Badge tone="violet" className="mr-1.5 px-1.5 py-0 align-[1px] text-[10px]">
                      官方
                    </Badge>
                  )}
                  {it.company} · {it.title}
                </div>
                <div className="mt-0.5 truncate text-xs text-muted">
                  {kind.label} · {formatDateTime(it.at)}
                  {it.location ? ` · ${it.location}` : ""}
                </div>
              </div>
              <Badge tone={due.tone}>{due.text}</Badge>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
