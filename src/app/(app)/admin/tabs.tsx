"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";

const tabs = [
  { href: "/admin", label: "📊 概览" },
  { href: "/admin/users", label: "👥 用户" },
  { href: "/admin/notify", label: "📣 通知" },
  { href: "/admin/feedback", label: "💡 反馈" },
  { href: "/admin/review", label: "🧾 发布审核" },
  { href: "/admin/openings", label: "📣 选考开放" },
  { href: "/watch", label: "🛰️ 网页监控" },
  { href: "/admin/reports", label: "🚩 举报" },
  { href: "/admin/import", label: "📥 批量导入" },
  { href: "/admin/signup", label: "🚪 注册与邀请" },
  { href: "/admin/ai", label: "🤖 AI 与额度" },
];

export function AdminTabs() {
  const path = usePathname();
  return (
    <div className="scrollbar-thin -mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      {tabs.map((t) => {
        const active = t.href === "/admin" ? path === "/admin" : path.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cx(
              "shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition",
              active ? "bg-violet-500 text-white" : "bg-paper text-muted shadow-[var(--shadow-soft)] hover:text-ink",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
