import Link from "next/link";
import { Clock3, Heart, Star, TriangleAlert } from "lucide-react";
import { Badge, cx } from "./ui";
import { POST_KINDS, POST_RESULTS, excerpt, parseBody, staleness, timeLabel, type Post } from "@/lib/community";

export function TimePill({ post, className }: { post: Pick<Post, "kind" | "occurred_on" | "ended_on" | "grad_year">; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-full bg-sky-50 px-2.5 py-0.5 text-xs font-medium text-sky-700 ring-1 ring-inset ring-sky-100", className)}>
      <Clock3 className="size-3" />
      {post.kind === "interview" ? "面试于 " : "在职 "}
      {timeLabel(post)}
    </span>
  );
}

export function Stars({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value} / 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={cx("size-3.5", i <= value ? "fill-lemon-500 text-lemon-500" : "text-stone-100")} />
      ))}
    </span>
  );
}

export function PostMeta({ post }: { post: Post }) {
  const kind = POST_KINDS[post.kind];
  const result = POST_RESULTS[post.result];
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge tone={kind.tone}>
        {kind.emoji} {kind.label}
      </Badge>
      <TimePill post={post} />
      {post.kind === "interview" && post.stage && <Badge tone="stone">{post.stage}</Badge>}
      {post.kind === "interview" && post.result !== "unknown" && result && <Badge tone={result.tone}>{result.label}</Badge>}
      {post.kind === "work" && post.employment_type && <Badge tone="stone">{post.employment_type}</Badge>}
      {post.kind === "work" && post.rating ? <Stars value={post.rating} /> : null}
    </div>
  );
}

export function authorLabel(post: Pick<Post, "author" | "anonymous">) {
  return post.anonymous || !post.author ? "匿名用户" : post.author;
}

export function PostCard({ post, showStatus = false }: { post: Post; showStatus?: boolean }) {
  const stale = staleness(post);
  return (
    <Link
      href={`/community/${post.id}`}
      className="animate-rise block rounded-[var(--radius-card)] border border-line bg-paper p-5 shadow-[var(--shadow-soft)] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm text-muted">
            <span className="font-semibold text-ink">{post.company_name}</span>
            {post.role && ` · ${post.role}`}
            {post.industry && ` · ${post.industry}`}
          </div>
          <h3 className="mt-1 font-semibold leading-snug">{post.title}</h3>
        </div>
        {showStatus && (
          <Badge tone={post.status === "published" ? "mint" : post.status === "hidden" ? "rose" : "lemon"}>
            {post.status === "published" ? "已发布" : post.status === "hidden" ? "已被隐藏" : "草稿"}
          </Badge>
        )}
      </div>
      <div className="mt-2.5">
        <PostMeta post={post} />
      </div>
      <p className="mt-2.5 text-sm leading-relaxed text-muted">{excerpt(post.body)}</p>
      {stale && (
        <p className="mt-2 flex items-center gap-1 text-xs text-lemon-700">
          <TriangleAlert className="size-3.5" /> {stale}
        </p>
      )}
      <div className="mt-3 flex items-center justify-between text-xs text-muted">
        <span className="flex flex-wrap gap-1">
          {post.tags.slice(0, 4).map((t) => (
            <span key={t} className="rounded-full bg-stone-50 px-2 py-0.5">
              #{t}
            </span>
          ))}
        </span>
        <span className="flex shrink-0 items-center gap-3">
          <span>{authorLabel(post)}</span>
          <span className={cx("flex items-center gap-1", post.voted && "text-sakura-600")}>
            <Heart className={cx("size-3.5", post.voted && "fill-sakura-500")} />
            {post.votes}
          </span>
        </span>
      </div>
    </Link>
  );
}

export function PostBody({ body }: { body: string }) {
  return (
    <div className="space-y-3 leading-relaxed">
      {parseBody(body).map((b, i) =>
        b.type === "h" ? (
          <h3 key={i} className="flex items-center gap-2 pt-3 font-semibold first:pt-0">
            <span className="h-4 w-1 rounded-full bg-sakura-300" />
            {b.text}
          </h3>
        ) : b.type === "ul" ? (
          <ul key={i} className="space-y-1.5 pl-1">
            {b.items.map((it, j) => (
              <li key={j} className="flex gap-2 text-[15px]">
                <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-sakura-300" />
                <span>{it}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p key={i} className="whitespace-pre-wrap text-[15px]">
            {b.text}
          </p>
        ),
      )}
    </div>
  );
}
