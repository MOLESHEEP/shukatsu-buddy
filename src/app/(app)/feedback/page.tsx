import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import type { FeedbackRow } from "@/lib/feedback";
import { FeedbackForm, FeedbackList } from "./feedback-client";

export const metadata = { title: "意见反馈" };

export default async function FeedbackPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const rows = await query(`SELECT * FROM feedback WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`, [user.id]);
  const items = rows.map((r) => ({
    ...(r as FeedbackRow),
    created_at: (r.created_at as Date).toISOString(),
    updated_at: (r.updated_at as Date).toISOString(),
    replied_at: r.replied_at ? (r.replied_at as Date).toISOString() : null,
  }));
  // Opening this page counts as reading the replies (clears the red dot); the list still highlights them this time.
  await query(`UPDATE feedback SET reply_seen = true WHERE user_id = $1 AND reply_seen = false`, [user.id]);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader emoji="💬" title="意见反馈" subtitle="有想要的功能、遇到的问题，或者对内容的意见，都可以告诉我们。管理员会在这里回复你。" />
      <div className="space-y-6">
        <FeedbackForm from={sp.from?.startsWith("/") ? sp.from : ""} />
        <FeedbackList items={items} />
      </div>
    </div>
  );
}
