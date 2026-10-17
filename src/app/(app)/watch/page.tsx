import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { isDemoMode } from "@/lib/llm/provider";
import { listDetections, listOfficial, listPages } from "@/lib/watch";
import { PERSONAL_LIMITS, canWatch } from "@/lib/watch-shared";
import { EmptyState, PageHeader, cx } from "@/components/ui";
import { AddPage, DetectionCard, PageRow, PasteReader, PublishedSchedule, ScheduleEditor } from "./client";

export const metadata = { title: "网页监控" };

const TABS = ["detections", "pages", "paste", "published", "new"] as const;
type Tab = (typeof TABS)[number];

export default async function WatchPage({ searchParams }: { searchParams: Promise<{ tab?: string; done?: string }> }) {
  const user = await requireUser();
  if (!canWatch(user)) redirect("/dashboard");
  const isAdmin = user.role === "admin";
  const sp = await searchParams;
  const tab: Tab = TABS.find((t) => t === sp.tab && (isAdmin || (t !== "published" && t !== "new"))) ?? "detections";
  const showDone = sp.done === "1";

  const [pages, detections, published, demo] = await Promise.all([
    listPages(user),
    tab === "detections" ? listDetections(user, { status: showDone ? "done" : "new" }) : Promise.resolve([]),
    tab === "published" ? listOfficial({ includeWithdrawn: true }) : Promise.resolve([]),
    isDemoMode(),
  ]);
  const pending = tab === "detections" && !showDone ? detections.length : null;

  const tabs: { k: Tab; label: string; admin?: boolean }[] = [
    { k: "detections", label: `🧠 识别结果${pending ? ` (${pending})` : ""}` },
    { k: "pages", label: `🛰️ 监控页面 (${pages.length})` },
    { k: "paste", label: "📋 粘贴识别" },
    { k: "published", label: "📅 已发布官方日程", admin: true },
    { k: "new", label: "＋ 手动发布", admin: true },
  ];

  return (
    <>
      <PageHeader
        emoji="🛰️"
        title="网页监控"
        subtitle={
          isAdmin
            ? "订阅公司采用页，AI 识别本选考是否开放、第几次选考和日程。确认后发布为官方日程，显示在用户日历上（标有「官方」），可选择通知用户。"
            : `订阅公司采用页，AI 识别本选考是否开放、第几次选考和日程，确认后加到你自己的选考追踪。最多 ${PERSONAL_LIMITS.pages} 个页面，每天最多识别 ${PERSONAL_LIMITS.aiPerDay} 次。`
        }
      />
      {demo && (
        <p className="mb-4 rounded-2xl bg-lemon-50 px-4 py-3 text-sm text-lemon-700">当前是演示模式（没有配置 AI），识别结果只是根据关键词的示例，不能当真。</p>
      )}
      <div className="scrollbar-thin -mx-4 mb-5 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        {tabs
          .filter((t) => !t.admin || isAdmin)
          .map((t) => (
            <Link
              key={t.k}
              href={`/watch?tab=${t.k}`}
              className={cx(
                "shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition",
                tab === t.k ? "bg-sakura-500 text-white" : "bg-paper text-muted shadow-[var(--shadow-soft)] hover:text-ink",
              )}
            >
              {t.label}
            </Link>
          ))}
      </div>

      {tab === "detections" && (
        <div className="space-y-3">
          <div className="flex gap-1 text-sm">
            <Link href="/watch?tab=detections" className={cx("rounded-full px-3 py-1", !showDone ? "bg-sakura-50 font-medium text-sakura-700" : "text-muted hover:bg-stone-50")}>
              待确认
            </Link>
            <Link href="/watch?tab=detections&done=1" className={cx("rounded-full px-3 py-1", showDone ? "bg-sakura-50 font-medium text-sakura-700" : "text-muted hover:bg-stone-50")}>
              已处理
            </Link>
          </div>
          {detections.length ? (
            detections.map((d) => <DetectionCard key={d.id} d={d} isAdmin={isAdmin} />)
          ) : (
            <EmptyState title={showDone ? "还没有处理过的识别结果" : "没有待确认的识别结果"}>
              {showDone ? null : "监控的页面内容有变化时，AI 识别的结果会出现在这里。也可以在「监控页面」里点「立即检查」，或用「粘贴识别」。"}
            </EmptyState>
          )}
        </div>
      )}

      {tab === "pages" && (
        <div className="space-y-3">
          <AddPage isAdmin={isAdmin} />
          {pages.length ? pages.map((p) => <PageRow key={p.id} p={p} isAdmin={isAdmin} />) : <EmptyState title="还没有监控的页面">添加公司的新卒采用页或募集要项页面的网址。</EmptyState>}
        </div>
      )}

      {tab === "paste" && <PasteReader />}

      {tab === "published" && (
        <div className="space-y-3">
          {published.length ? published.map((s) => <PublishedSchedule key={s.id} s={s} />) : <EmptyState title="还没有发布官方日程" />}
        </div>
      )}

      {tab === "new" && <ScheduleEditor mode="publish" />}
    </>
  );
}
