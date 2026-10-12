import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, TriangleAlert } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getPost } from "@/lib/posts";
import { staleness } from "@/lib/community";
import { Badge, Card } from "@/components/ui";
import { PostBody, PostMeta, authorLabel } from "@/components/post-view";
import { AdminPostActions, OwnerActions, ReportButton, VoteButton } from "./actions";

export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const isAdmin = user.role === "admin";
  const post = await getPost(user.id, id, isAdmin);
  if (!post) notFound();
  const mine = post.user_id === user.id;
  const stale = staleness(post);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link href={mine ? "/community?tab=mine" : "/community"} className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ChevronLeft className="size-4" /> 经验分享
      </Link>

      <Card className="p-6 sm:p-8">
        {post.status === "draft" && (
          <Badge tone="lemon" className="mb-3">
            草稿 · 仅自己可见
          </Badge>
        )}
        {post.status === "hidden" && (
          <p className="mb-4 rounded-xl bg-sakura-50 px-3.5 py-2.5 text-sm text-sakura-700">
            {mine ? "这篇分享因被举报已由管理员隐藏，其他用户看不到。如有疑问请联系管理员。" : "这篇分享已被管理员隐藏（仅管理员和作者可见）。"}
          </p>
        )}
        <div className="text-sm text-muted">
          <span className="font-semibold text-ink">{post.company_name}</span>
          {post.role && ` · ${post.role}`}
          {post.industry && ` · ${post.industry}`}
        </div>
        <h1 className="mt-1.5 text-2xl font-bold leading-snug tracking-tight">{post.title}</h1>
        <div className="mt-3">
          <PostMeta post={post} />
        </div>
        {stale && (
          <p className="mt-4 flex items-center gap-2 rounded-xl bg-lemon-50 px-3.5 py-2.5 text-sm text-lemon-700">
            <TriangleAlert className="size-4 shrink-0" /> {stale}
          </p>
        )}
        <div className="mt-6 border-t border-line pt-6">
          <PostBody body={post.body} />
        </div>
        {post.tags.length > 0 && (
          <div className="mt-6 flex flex-wrap gap-1.5">
            {post.tags.map((t) => (
              <Link key={t} href={`/community?q=${encodeURIComponent(t)}`} className="rounded-full bg-stone-50 px-2.5 py-1 text-xs text-muted hover:bg-sakura-50 hover:text-sakura-700">
                #{t}
              </Link>
            ))}
          </div>
        )}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-xs text-muted">
          <span>
            {post.source ? `来源：${post.source}` : authorLabel(post)} · {post.published_at ? `发布于 ${new Date(post.published_at).toLocaleDateString("zh-CN")}` : "未发布"}
            {post.published_at && post.updated_at > post.published_at && new Date(post.updated_at).getTime() - new Date(post.published_at).getTime() > 60000
              ? ` · 更新于 ${new Date(post.updated_at).toLocaleDateString("zh-CN")}`
              : ""}
          </span>
          {post.status === "published" && <VoteButton id={post.id} votes={post.votes} voted={post.voted} disabled={mine} />}
        </div>
      </Card>

      {mine && <OwnerActions id={post.id} status={post.status} />}
      {isAdmin && !mine && <AdminPostActions id={post.id} status={post.status} />}
      <div className="flex items-center justify-center gap-3 text-xs text-muted">
        <span>内容为作者个人经历与观点，仅供参考。</span>
        {!mine && post.status === "published" && <ReportButton id={post.id} />}
      </div>
    </div>
  );
}
