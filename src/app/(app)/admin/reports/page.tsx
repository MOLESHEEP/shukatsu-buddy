import Link from "next/link";
import { listReports } from "@/lib/admin";
import { cx } from "@/components/ui";
import { ReportsList } from "./reports-list";

export default async function AdminReports({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const sp = await searchParams;
  const status = ["open", "resolved", "dismissed", "all"].includes(sp.status ?? "") ? sp.status! : "open";
  const reports = await listReports(status);
  const tabs = [
    { k: "open", label: "待处理" },
    { k: "resolved", label: "已处理" },
    { k: "dismissed", label: "已驳回" },
    { k: "all", label: "全部" },
  ];
  return (
    <div className="space-y-4">
      <div className="flex gap-1">
        {tabs.map((t) => (
          <Link
            key={t.k}
            href={`/admin/reports?status=${t.k}`}
            className={cx("rounded-full px-3.5 py-1.5 text-sm", status === t.k ? "bg-sakura-50 font-medium text-sakura-700" : "text-muted hover:bg-stone-50")}
          >
            {t.label}
          </Link>
        ))}
      </div>
      <ReportsList reports={reports} />
    </div>
  );
}
