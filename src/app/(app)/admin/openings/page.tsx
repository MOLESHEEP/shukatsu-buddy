import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { listOpenings, listReports, pendingReportCount } from "@/lib/openings";
import { EmptyState, cx } from "@/components/ui";
import { BulkPaste, OpeningEditor, PublishedOpening, ReportReview } from "./admin-openings";

const VIEWS = ["pending", "published", "new", "approved", "rejected"] as const;
type View = (typeof VIEWS)[number];

export default async function AdminOpenings({ searchParams }: { searchParams: Promise<{ view?: string; q?: string }> }) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const view: View = VIEWS.find((v) => v === sp.view) ?? "pending";
  const pending = await pendingReportCount();

  const tabs: { k: View; label: string }[] = [
    { k: "pending", label: `待审核${pending ? ` (${pending})` : ""}` },
    { k: "published", label: "已发布" },
    { k: "new", label: "＋ 录入" },
    { k: "approved", label: "最近通过" },
    { k: "rejected", label: "已驳回" },
  ];

  let body: React.ReactNode;
  if (view === "new") {
    body = (
      <div className="space-y-4">
        <OpeningEditor />
        <BulkPaste />
      </div>
    );
  } else if (view === "published") {
    const rows = await listOpenings(admin.id, { q: sp.q?.trim() || undefined, showClosed: true });
    body = (
      <div className="space-y-3">
        <form action="/admin/openings" className="flex gap-2">
          <input type="hidden" name="view" value="published" />
          <input name="q" defaultValue={sp.q} placeholder="搜索公司" className="w-full max-w-xs rounded-xl border border-line bg-paper px-3.5 py-2 text-sm" />
          <button className="rounded-xl bg-paper px-4 py-2 text-sm font-medium shadow-[var(--shadow-soft)] hover:bg-stone-50">搜索</button>
        </form>
        {rows.length ? rows.map((o) => <PublishedOpening key={o.id} o={o} />) : <EmptyState title="还没有发布的选考信息" />}
      </div>
    );
  } else {
    const rows = await listReports(view);
    body = rows.length ? (
      <div className="space-y-3">
        {rows.map((r) => (
          <ReportReview key={r.id} r={r} />
        ))}
      </div>
    ) : (
      <EmptyState title={view === "pending" ? "没有待审核的上报 🎉" : "这里还没有记录"}>
        {view === "pending" ? "用户选择「公开」上报的选考开放信息会在这里等你审核。「仅自己可见」的上报不会出现在这里。" : null}
      </EmptyState>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        本选考开放信息：管理员直接录入，或审核用户的公开上报。发布或日期 / 链接变化时，关注这家公司（且届数匹配）的用户会收到站内「重要」通知。
      </p>
      <div className="scrollbar-thin flex gap-1 overflow-x-auto">
        {tabs.map((t) => (
          <Link
            key={t.k}
            href={`/admin/openings?view=${t.k}`}
            className={cx("shrink-0 rounded-full px-3.5 py-1.5 text-sm", view === t.k ? "bg-sakura-50 font-medium text-sakura-700" : "text-muted hover:bg-stone-50")}
          >
            {t.label}
          </Link>
        ))}
      </div>
      {body}
    </div>
  );
}
