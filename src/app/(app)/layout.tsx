import { requireUser } from "@/lib/auth";
import { providerLabel } from "@/lib/llm/provider";
import { BottomNav, MobileTopBar, SideNav } from "@/components/nav";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const isAdmin = user.role === "admin";
  return (
    <div className="flex min-h-dvh">
      <SideNav name={user.display_name || user.email} provider={isAdmin ? await providerLabel() : null} isAdmin={isAdmin} />
      <div className="min-w-0 flex-1">
        <MobileTopBar isAdmin={isAdmin} />
        <main className="mx-auto max-w-6xl px-4 pt-6 pb-28 sm:px-6 md:pt-10 md:pb-12">{children}</main>
      </div>
      <BottomNav />
    </div>
  );
}
