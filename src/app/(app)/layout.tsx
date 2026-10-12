import { requireUser } from "@/lib/auth";
import { queryOne } from "@/lib/db";
import { providerLabel } from "@/lib/llm/provider";
import { unreadCount } from "@/lib/notifications";
import { BottomNav, MobileTopBar, SideNav } from "@/components/nav";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const isAdmin = user.role === "admin";
  const badges = await queryOne<{ replies: number; pending: number }>(
    `SELECT (SELECT count(*) FROM feedback WHERE user_id = $1 AND reply_seen = false)::int AS replies,
            CASE WHEN $2::boolean THEN (SELECT count(*) FROM feedback WHERE status = 'new')::int
                                     + (SELECT count(*) FROM post_reports WHERE status = 'open')::int ELSE 0 END AS pending`,
    [user.id, isAdmin],
  );
  const counts = { replies: badges?.replies ?? 0, pending: badges?.pending ?? 0, notices: await unreadCount(user.id) };
  return (
    <div className="flex min-h-dvh">
      <SideNav name={user.display_name || user.email} provider={isAdmin ? await providerLabel() : null} isAdmin={isAdmin} counts={counts} />
      <div className="min-w-0 flex-1">
        <MobileTopBar isAdmin={isAdmin} counts={counts} />
        <main className="mx-auto max-w-6xl px-4 pt-6 pb-28 sm:px-6 md:pt-10 md:pb-12">{children}</main>
      </div>
      <BottomNav />
    </div>
  );
}
