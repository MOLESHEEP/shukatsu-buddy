"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, ClipboardCheck, House, LogOut, Mail, MessageSquareHeart, PenLine, Settings, ShieldCheck, SquareKanban, Users } from "lucide-react";
import { cx } from "./ui";

const items = [
  { href: "/dashboard", label: "首页", icon: House },
  { href: "/es", label: "ES添削", icon: PenLine },
  { href: "/tracker", label: "选考", icon: SquareKanban },
  { href: "/inbox", label: "邮件", icon: Mail },
  { href: "/tests", label: "笔试", icon: ClipboardCheck },
  { href: "/community", label: "经验", icon: Users },
];

type Counts = { replies: number; pending: number; notices: number };

function Dot({ n }: { n: number }) {
  if (!n) return null;
  return <span className="ml-auto min-w-5 rounded-full bg-sakura-500 px-1.5 text-center text-[11px] font-semibold leading-5 text-white tabular-nums">{n > 99 ? "99+" : n}</span>;
}

/** Feedback link carries the current page so admins know where the user was. */
function feedbackHref(path: string) {
  return path.startsWith("/feedback") ? "/feedback" : `/feedback?from=${encodeURIComponent(path)}`;
}

export function SideNav({ name, provider, isAdmin, counts }: { name: string; provider: string | null; isAdmin: boolean; counts: Counts }) {
  const path = usePathname();
  const router = useRouter();
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }
  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-line bg-paper/70 px-4 py-6 backdrop-blur md:flex">
      <Link href="/dashboard" className="flex items-center gap-2 px-2 font-bold">
        <img src="/icon.svg" alt="" className="size-8" />
        就活小助手
      </Link>
      <nav className="mt-8 space-y-1">
        {[
          ...items,
          ...(isAdmin ? [{ href: "/admin", label: "管理后台", icon: ShieldCheck, badge: counts.pending }] : []),
          { href: "/notifications", label: "通知", icon: Bell, badge: counts.notices },
          { href: "/feedback", label: "意见反馈", icon: MessageSquareHeart, badge: counts.replies },
          { href: "/settings", label: "设置", icon: Settings },
        ].map((it: { href: string; label: string; icon: typeof House; badge?: number }) => {
          const active = path.startsWith(it.href);
          return (
            <Link
              key={it.href}
              href={it.href === "/feedback" ? feedbackHref(path) : it.href}
              className={cx(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
                active ? "bg-sakura-50 text-sakura-700" : "text-muted hover:bg-stone-50 hover:text-ink",
              )}
            >
              <it.icon className="size-[18px]" />
              {({ 选考: "选考追踪", 邮件: "邮件助手", 经验: "经验分享" } as Record<string, string>)[it.label] ?? it.label}
              <Dot n={it.badge ?? 0} />
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto space-y-3 px-2">
        {provider && (
          <Link href="/admin/ai" className="block rounded-xl bg-violet-50 px-3 py-2 text-xs text-violet-700 hover:bg-violet-100">
            <div className="font-medium">AI 引擎</div>
            <div className="mt-0.5 truncate opacity-80">{provider}</div>
          </Link>
        )}
        <div className="flex items-center justify-between text-sm">
          <span className="truncate text-muted">{name}</span>
          <button onClick={logout} className="rounded-lg p-1.5 text-muted hover:bg-stone-50 hover:text-ink" title="退出登录">
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}

export function BottomNav() {
  const path = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper/90 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <div className="grid grid-cols-6">
        {items.map((it) => {
          const active = path.startsWith(it.href);
          return (
            <Link key={it.href} href={it.href} className={cx("flex flex-col items-center gap-0.5 py-2 text-[11px]", active ? "text-sakura-600" : "text-muted")}>
              <span className={cx("rounded-full px-2.5 py-1 transition", active && "bg-sakura-50")}>
                <it.icon className="size-5" />
              </span>
              {it.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function MobileTopBar({ isAdmin, counts }: { isAdmin: boolean; counts: Counts }) {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between border-b border-line bg-cream/85 px-4 py-3 backdrop-blur md:hidden">
      <Link href="/dashboard" className="flex items-center gap-2 font-bold">
        <img src="/icon.svg" alt="" className="size-7" />
        就活小助手
      </Link>
      <div className="flex">
        {isAdmin && (
          <Link href="/admin" className="relative rounded-full p-2 text-violet-600 hover:bg-paper" aria-label="管理后台">
            <ShieldCheck className="size-5" />
            {counts.pending > 0 && <span className="absolute top-1 right-1 size-2 rounded-full bg-sakura-500" />}
          </Link>
        )}
        <Link href="/notifications" className="relative rounded-full p-2 text-muted hover:bg-paper" aria-label="通知">
          <Bell className="size-5" />
          {counts.notices > 0 && <span className="absolute top-1 right-1 size-2 rounded-full bg-sakura-500" />}
        </Link>
        <Link href={feedbackHref(path)} className="relative rounded-full p-2 text-muted hover:bg-paper" aria-label="意见反馈">
          <MessageSquareHeart className="size-5" />
          {counts.replies > 0 && <span className="absolute top-1 right-1 size-2 rounded-full bg-sakura-500" />}
        </Link>
        <Link href="/settings" className="rounded-full p-2 text-muted hover:bg-paper" aria-label="设置">
          <Settings className="size-5" />
        </Link>
      </div>
    </header>
  );
}
