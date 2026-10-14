import Link from "next/link";
import { Megaphone, Search } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { listFollows, listMyReports, listOpenings } from "@/lib/openings";
import { EmptyState, Input, PageHeader, Select, cx } from "@/components/ui";
import { FollowManager, MyReports, OpeningCard } from "./client";

export const metadata = { title: "选考开放" };

type SP = { tab?: string; q?: string; grad?: string; focus?: string };

export default async function OpeningsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const tab = sp.tab === "following" || sp.tab === "mine" ? sp.tab : "all";
  const focus = Number(sp.focus) || null;
  // Default to the user's own 届; "all" shows every 届. A notice link (focus) always shows everything so the record is on the page.
  const grad = sp.grad === "all" || focus ? undefined : Number(sp.grad) || user.grad_year || undefined;

  const [openings, follows, reports] = await Promise.all([
    tab === "mine" ? Promise.resolve([]) : listOpenings(user.id, { q: sp.q?.trim() || undefined, scope: tab === "following" ? "following" : "all", grad, showClosed: Boolean(focus) }),
    listFollows(user.id),
    tab === "mine" ? listMyReports(user.id) : Promise.resolve([]),
  ]);

  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => thisYear + 3 - i);
  const tabs = [
    { key: "all", label: "全部" },
    { key: "following", label: `⭐ 我关注的${follows.length ? ` (${follows.length})` : ""}` },
    { key: "mine", label: "我的上报" },
  ];

  return (
    <>
      <PageHeader
        emoji="📣"
        title="选考开放"
        subtitle="各公司本选考的エントリー开放和截止时间。关注公司后，开放或信息更新时会在站内通知你。"
        action={
          <Link
            href="/openings/new"
            className="inline-flex items-center gap-1.5 rounded-full bg-sakura-500 px-5 py-2.5 text-sm font-medium text-white shadow-[var(--shadow-lift)] transition hover:bg-sakura-600"
          >
            <Megaphone className="size-4" /> 上报开放信息
          </Link>
        }
      />

      <div className="mb-5 space-y-3">
        <div className="scrollbar-thin -mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          {tabs.map((t) => (
            <Link
              key={t.key}
              href={t.key === "all" ? "/openings" : `/openings?tab=${t.key}`}
              className={cx(
                "shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition",
                tab === t.key ? "bg-sakura-500 text-white" : "bg-paper text-muted shadow-[var(--shadow-soft)] hover:text-ink",
              )}
            >
              {t.label}
            </Link>
          ))}
        </div>
        {tab !== "mine" && (
          <form action="/openings" className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_auto_auto]">
            {tab !== "all" && <input type="hidden" name="tab" value={tab} />}
            <div className="relative col-span-2 sm:col-span-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
              <Input name="q" defaultValue={sp.q} placeholder="搜索公司" className="pl-9" />
            </div>
            <Select name="grad" defaultValue={grad ? String(grad) : "all"} className="w-auto">
              <option value="all">所有届</option>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y} 届{y === user.grad_year ? "（我）" : ""}
                </option>
              ))}
            </Select>
            <button className="rounded-xl bg-paper px-4 py-2.5 text-sm font-medium shadow-[var(--shadow-soft)] hover:bg-stone-50">筛选</button>
          </form>
        )}
      </div>

      {tab === "following" && <FollowManager follows={follows} />}

      {tab === "mine" ? (
        <MyReports reports={reports} />
      ) : openings.length ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {openings.map((o) => (
            <OpeningCard key={o.id} o={o} focused={o.id === focus} />
          ))}
        </div>
      ) : (
        <EmptyState
          title={tab === "following" ? "你关注的公司还没有开放信息" : sp.q ? "没有找到这家公司的记录" : "还没有开放信息"}
          action={
            <Link href={`/openings/new${sp.q ? `?company=${encodeURIComponent(sp.q)}` : ""}`} className="text-sm font-medium text-sakura-600 hover:underline">
              知道哪家开放了？上报一下 →
            </Link>
          }
        >
          {tab === "following" ? "有新消息时会第一时间通知你。" : grad ? `当前只显示 ${grad} 届和不限届的信息，可以在上面切换「所有届」。` : null}
        </EmptyState>
      )}
    </>
  );
}
