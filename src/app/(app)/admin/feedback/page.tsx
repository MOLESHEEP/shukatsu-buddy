import Link from "next/link";
import { query } from "@/lib/db";
import { cx } from "@/components/ui";
import { FEEDBACK_CATEGORIES, FEEDBACK_STATUS, type FeedbackRow } from "@/lib/feedback";
import { AdminFeedbackList } from "./admin-feedback";

export default async function AdminFeedback({ searchParams }: { searchParams: Promise<{ status?: string; category?: string }> }) {
  const sp = await searchParams;
  const status = sp.status === "all" || FEEDBACK_STATUS[sp.status ?? ""] ? sp.status! : "open";
  const category = FEEDBACK_CATEGORIES[sp.category ?? ""] ? sp.category! : "";
  const [rows, counts] = await Promise.all([
    query(
      `SELECT f.*, u.email AS user_email, u.display_name AS user_name
         FROM feedback f LEFT JOIN users u ON u.id = f.user_id
        WHERE ($1::text = 'all' OR ($1::text = 'open' AND f.status IN ('new', 'doing', 'accepted')) OR f.status = $1::text)
          AND ($2::text = '' OR f.category = $2::text)
        ORDER BY CASE f.status WHEN 'new' THEN 0 ELSE 1 END, f.created_at DESC LIMIT 200`,
      [status, category],
    ),
    query<{ status: string; n: number }>(`SELECT status, count(*)::int AS n FROM feedback GROUP BY status`),
  ]);
  const items = rows.map((r) => ({
    ...(r as FeedbackRow),
    created_at: (r.created_at as Date).toISOString(),
    updated_at: (r.updated_at as Date).toISOString(),
    replied_at: r.replied_at ? (r.replied_at as Date).toISOString() : null,
  }));
  const count = (s: string) => counts.find((c) => c.status === s)?.n ?? 0;
  const tabs = [
    { k: "open", label: `未完成 ${count("new") + count("doing") + count("accepted")}` },
    ...Object.entries(FEEDBACK_STATUS).map(([k, v]) => ({ k, label: `${v.label} ${count(k)}` })),
    { k: "all", label: "全部" },
  ];
  const href = (patch: Record<string, string>) => `/admin/feedback?${new URLSearchParams({ status, ...(category ? { category } : {}), ...patch })}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="scrollbar-thin flex gap-1 overflow-x-auto">
          {tabs.map((t) => (
            <Link key={t.k} href={href({ status: t.k })} className={cx("shrink-0 rounded-full px-3.5 py-1.5 text-sm", status === t.k ? "bg-sakura-50 font-medium text-sakura-700" : "text-muted hover:bg-stone-50")}>
              {t.label}
            </Link>
          ))}
        </div>
        <div className="flex gap-1 text-xs">
          <Link href={href({ category: "" })} className={cx("rounded-full px-2.5 py-1", !category ? "bg-stone-100 font-medium" : "text-muted")}>
            全部类别
          </Link>
          {Object.entries(FEEDBACK_CATEGORIES).map(([k, v]) => (
            <Link key={k} href={href({ category: k })} className={cx("rounded-full px-2.5 py-1", category === k ? "bg-stone-100 font-medium" : "text-muted")}>
              {v.emoji} {v.label}
            </Link>
          ))}
        </div>
      </div>
      <AdminFeedbackList items={items} />
    </div>
  );
}
