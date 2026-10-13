import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { listReviewQueue } from "@/lib/review";
import { getPointSettings } from "@/lib/points";
import { isDemoMode } from "@/lib/llm/provider";
import { cx } from "@/components/ui";
import { PointSettingsCard, ReviewQueue } from "./review-queue";

export default async function AdminReview({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const me = await requireAdmin();
  const sp = await searchParams;
  const status = (["pending", "rejected", "published"] as const).find((s) => s === sp.status) ?? "pending";
  const [rows, settings, demo] = await Promise.all([listReviewQueue(status), getPointSettings(), isDemoMode()]);
  const tabs = [
    { k: "pending", label: "待审核" },
    { k: "rejected", label: "未通过" },
    { k: "published", label: "最近通过" },
  ];
  return (
    <div className="space-y-4">
      <PointSettingsCard settings={settings} viewerSuper={me.is_super} demo={demo} />
      <div className="flex gap-1">
        {tabs.map((t) => (
          <Link
            key={t.k}
            href={`/admin/review?status=${t.k}`}
            className={cx("rounded-full px-3.5 py-1.5 text-sm", status === t.k ? "bg-sakura-50 font-medium text-sakura-700" : "text-muted hover:bg-stone-50")}
          >
            {t.label}
          </Link>
        ))}
      </div>
      <ReviewQueue rows={rows} status={status} />
    </div>
  );
}
