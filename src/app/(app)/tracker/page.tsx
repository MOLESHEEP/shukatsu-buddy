import Link from "next/link";
import { CalendarDays, Megaphone, Rss, SquareKanban } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { calendarItems, listCompanies } from "@/lib/data";
import { localToIso, todayLocal } from "@/lib/time";
import { PageHeader, cx } from "@/components/ui";
import { Kanban } from "./kanban";
import { MonthCalendar } from "./calendar";
import { AddCompany } from "./add-company";

export const metadata = { title: "选考追踪" };

export default async function TrackerPage({ searchParams }: { searchParams: Promise<{ view?: string; month?: string; new?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const view = sp.view === "calendar" ? "calendar" : "kanban";
  const companies = await listCompanies(user.id);

  let calendar: React.ReactNode = null;
  if (view === "calendar") {
    const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : todayLocal().slice(0, 7);
    const [y, m] = month.split("-").map(Number);
    const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
    const items = await calendarItems(user.id, localToIso(`${month}-01T00:00`)!, localToIso(`${next}-01T00:00`)!);
    calendar = <MonthCalendar month={month} items={items} />;
  }

  const tabs = [
    { key: "kanban", label: "看板", icon: SquareKanban },
    { key: "calendar", label: "日历", icon: CalendarDays },
  ];

  return (
    <>
      <PageHeader
        emoji="🗂️"
        title="选考追踪"
        subtitle="每家公司走到哪一步、下一步什么时候截止，一眼看清。拖动卡片即可更新阶段。"
        action={<AddCompany defaultOpen={sp.new === "1"} />}
      />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-full bg-paper p-1 shadow-[var(--shadow-soft)]">
          {tabs.map((t) => (
            <Link
              key={t.key}
              href={`/tracker?view=${t.key}`}
              className={cx(
                "flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition",
                view === t.key ? "bg-sakura-500 text-white" : "text-muted hover:text-ink",
              )}
            >
              <t.icon className="size-4" />
              {t.label}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Link href="/openings" className="flex items-center gap-1.5 text-sm text-muted hover:text-sakura-600">
            <Megaphone className="size-4" />
            本选考开放信息
          </Link>
          <Link href="/settings#calendar" className="flex items-center gap-1.5 text-sm text-muted hover:text-sakura-600">
            <Rss className="size-4" />
            订阅到手机日历，自动提醒
          </Link>
        </div>
      </div>
      {view === "kanban" ? <Kanban companies={companies} /> : calendar}
    </>
  );
}
