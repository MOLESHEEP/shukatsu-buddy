"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Bell, ClipboardCheck, Coins, House, LogOut, Mail, Megaphone, Menu, MessageSquareHeart, PenLine, Radar, Settings, ShieldCheck, SquareKanban, Users, X } from "lucide-react";
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

export function SideNav({ name, provider, isAdmin, canWatch = false, counts }: { name: string; provider: string | null; isAdmin: boolean; canWatch?: boolean; counts: Counts }) {
  const path = usePathname();
  const router = useRouter();
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }
  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-line bg-paper/70 px-4 py-6 backdrop-blur md:flex [@media(max-height:820px)]:py-4">
      <Link href="/dashboard" className="flex shrink-0 items-center gap-2 px-2 font-bold">
        <img src="/icon.svg" alt="" className="size-8" />
        就活小助手
      </Link>
      {/* The menu scrolls on its own when the window is short, so the account row below always stays visible. */}
      <nav className="scrollbar-thin -mx-2 mt-8 min-h-0 flex-1 space-y-1 overflow-y-auto px-2 [@media(max-height:820px)]:mt-5 [@media(max-height:820px)]:space-y-0.5">
        {[
          ...items,
          { href: "/openings", label: "选考开放", icon: Megaphone },
          ...(canWatch ? [{ href: "/watch", label: "网页监控", icon: Radar }] : []),
          ...(isAdmin ? [{ href: "/admin", label: "管理后台", icon: ShieldCheck, badge: counts.pending }] : []),
          { href: "/points", label: "积分", icon: Coins },
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
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition [@media(max-height:820px)]:py-2",
                active ? "bg-sakura-50 text-sakura-700" : "text-muted hover:bg-stone-50 hover:text-ink",
              )}
            >
              <it.icon className="size-[18px] shrink-0" />
              {({ 选考: "选考追踪", 邮件: "邮件助手", 经验: "经验分享", 积分: "积分 · Point Market" } as Record<string, string>)[it.label] ?? it.label}
              <Dot n={it.badge ?? 0} />
            </Link>
          );
        })}
      </nav>
      <div className="mt-3 shrink-0 space-y-3 border-t border-line px-2 pt-3">
        {provider && (
          <Link href="/admin/ai" className="block rounded-xl bg-violet-50 px-3 py-2 text-xs text-violet-700 hover:bg-violet-100">
            <div className="font-medium">AI 引擎</div>
            <div className="mt-0.5 truncate opacity-80 [@media(max-height:700px)]:hidden">{provider}</div>
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

/** Mobile header: notifications and a 「更多」 sheet with every page the 6-tab bottom bar can't hold. */
export function MobileTopBar({ isAdmin, canWatch = false, name = "", counts }: { isAdmin: boolean; canWatch?: boolean; name?: string; counts: Counts }) {
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  // Close on navigation and with Esc; keep the page behind from scrolling while the sheet is open.
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const more: { href: string; label: string; icon: typeof House; tone: string; badge?: number }[] = [
    { href: "/openings", label: "选考开放", icon: Megaphone, tone: "text-sakura-600" },
    ...(canWatch ? [{ href: "/watch", label: "网页监控", icon: Radar, tone: "text-sky-700" }] : []),
    ...(isAdmin ? [{ href: "/admin", label: "管理后台", icon: ShieldCheck, tone: "text-violet-600", badge: counts.pending }] : []),
    { href: "/points", label: "积分", icon: Coins, tone: "text-lemon-700" },
    { href: feedbackHref(path), label: "意见反馈", icon: MessageSquareHeart, tone: "text-mint-700", badge: counts.replies },
    { href: "/settings", label: "设置", icon: Settings, tone: "text-muted" },
  ];
  const moreDot = counts.pending + counts.replies > 0;
  const moreActive = more.some((m) => path.startsWith(m.href.split("?")[0]));

  return (
    <>
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-line bg-cream/85 px-4 py-2.5 backdrop-blur md:hidden">
        <Link href="/dashboard" className="flex min-w-0 items-center gap-2 font-bold">
          <img src="/icon.svg" alt="" className="size-7 shrink-0" />
          <span className="truncate">就活小助手</span>
        </Link>
        <div className="flex shrink-0 items-center">
          <Link href="/notifications" className="relative rounded-full p-2.5 text-muted hover:bg-paper" aria-label="通知">
            <Bell className="size-5" />
            {counts.notices > 0 && <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-sakura-500" />}
          </Link>
          <button
            onClick={() => setOpen(true)}
            className={cx("relative rounded-full p-2.5 hover:bg-paper", moreActive ? "text-sakura-600" : "text-muted")}
            aria-label="更多"
            aria-expanded={open}
          >
            <Menu className="size-5" />
            {moreDot && <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-sakura-500" />}
          </button>
        </div>
      </header>

      {open && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="更多">
          <button className="absolute inset-0 bg-ink/30 backdrop-blur-[2px]" aria-label="关闭" onClick={() => setOpen(false)} />
          <div className="animate-rise absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-3xl bg-paper px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-[var(--shadow-lift)]">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" />
            <div className="mb-3 flex items-center justify-between">
              <p className="font-semibold">更多</p>
              <button onClick={() => setOpen(false)} className="rounded-full p-2 text-muted hover:bg-stone-50" aria-label="关闭">
                <X className="size-5" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {more.map((m) => {
                const active = path.startsWith(m.href.split("?")[0]);
                return (
                  <Link
                    key={m.label}
                    href={m.href}
                    className={cx(
                      "relative flex flex-col items-center gap-1.5 rounded-2xl px-2 py-3.5 text-xs font-medium transition",
                      active ? "bg-sakura-50 text-sakura-700" : "bg-cream/70 text-ink hover:bg-stone-50",
                    )}
                  >
                    <m.icon className={cx("size-6", !active && m.tone)} />
                    {m.label}
                    {(m.badge ?? 0) > 0 && (
                      <span className="absolute top-2 right-2 min-w-5 rounded-full bg-sakura-500 px-1.5 text-center text-[11px] leading-5 text-white tabular-nums">
                        {m.badge! > 99 ? "99+" : m.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-line pt-3 text-sm">
              <span className="min-w-0 truncate text-muted">{name}</span>
              <button onClick={logout} className="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-muted hover:bg-stone-50 hover:text-ink">
                <LogOut className="size-4" /> 退出登录
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
