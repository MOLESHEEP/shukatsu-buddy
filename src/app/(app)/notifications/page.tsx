import Link from "next/link";
import { ArrowRight, Megaphone } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { listAnnouncements, markRead } from "@/lib/notifications";
import { Badge, Card, EmptyState, PageHeader, cx } from "@/components/ui";

export const metadata = { title: "通知" };

export default async function NotificationsPage() {
  const user = await requireUser();
  const items = await listAnnouncements(user.id);
  // Opening the page reads everything (the badge clears); this render still highlights what was new.
  await markRead(user.id);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader emoji="🔔" title="通知" subtitle="来自管理员的公告和消息。" />
      {items.length === 0 ? (
        <EmptyState title="还没有通知" />
      ) : (
        <div className="space-y-3">
          {items.map((n) => (
            <Card key={n.id} className={cx("space-y-2", !n.read && "border-sakura-300", n.level === "important" && "bg-gradient-to-br from-lemon-50 to-paper")}>
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                {n.level === "important" ? (
                  <Badge tone="lemon">
                    <Megaphone className="size-3" /> 重要
                  </Badge>
                ) : (
                  <Badge tone="sky">通知</Badge>
                )}
                {!n.read && <Badge tone="rose">新</Badge>}
                <span>{new Date(n.created_at).toLocaleString("zh-CN")}</span>
              </div>
              <h2 className="font-semibold">{n.title}</h2>
              {n.body && <p className="whitespace-pre-wrap text-sm leading-relaxed">{n.body}</p>}
              {n.link && (
                <Link href={n.link} target={n.link.startsWith("http") ? "_blank" : undefined} className="inline-flex items-center gap-1 text-sm font-medium text-sakura-600 hover:underline">
                  查看详情 <ArrowRight className="size-3.5" />
                </Link>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
