import Link from "next/link";
import { PenLine, Search } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { listFeed, listMine } from "@/lib/posts";
import { EmptyState, Input, PageHeader, Select, cx } from "@/components/ui";
import { PostCard } from "@/components/post-view";

export const metadata = { title: "经验分享" };

type SP = { tab?: string; q?: string; year?: string; sort?: string };

export default async function CommunityPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const tab = ["interview", "work", "mine"].includes(sp.tab ?? "") ? sp.tab! : "all";
  const year = Number(sp.year) || undefined;
  const sort = sp.sort === "helpful" ? "helpful" : "recent";
  const posts = tab === "mine" ? await listMine(user.id) : await listFeed(user.id, { kind: tab, q: sp.q?.trim(), year, sort });

  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: 8 }, (_, i) => thisYear + 1 - i);
  const tabs = [
    { key: "all", label: "全部" },
    { key: "interview", label: "🎤 面试经验" },
    { key: "work", label: "💼 工作体验" },
    { key: "mine", label: "我的分享" },
  ];
  const link = (patch: Partial<SP>) => {
    const p = new URLSearchParams(Object.entries({ ...sp, ...patch }).filter(([, v]) => v) as [string, string][]);
    return `/community?${p}`;
  };

  return (
    <>
      <PageHeader
        emoji="🌱"
        title="经验分享"
        subtitle="前辈们的面试经验和在日工作体验。每篇都标注了经历发生的时间，参考时请注意时效。"
        action={
          <Link
            href="/community/new"
            className="inline-flex items-center gap-1.5 rounded-full bg-sakura-500 px-5 py-2.5 text-sm font-medium text-white shadow-[var(--shadow-lift)] transition hover:bg-sakura-600"
          >
            <PenLine className="size-4" /> 分享我的经验
          </Link>
        }
      />

      <div className="mb-5 space-y-3">
        <div className="scrollbar-thin -mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          {tabs.map((t) => (
            <Link
              key={t.key}
              href={t.key === "all" ? "/community" : `/community?tab=${t.key}`}
              className={cx(
                "shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition",
                tab === t.key ? "bg-sakura-500 text-white" : "bg-paper text-muted shadow-[var(--shadow-soft)] hover:text-ink",
              )}
            >
              {t.label}
            </Link>
          ))}
        </div>
        {tab !== "mine" && (
          <form action="/community" className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
            {tab !== "all" && <input type="hidden" name="tab" value={tab} />}
            <div className="relative col-span-2 sm:col-span-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
              <Input name="q" defaultValue={sp.q} placeholder="搜索公司、行业、职种或标签" className="pl-9" />
            </div>
            <Select name="year" defaultValue={sp.year ?? ""} className="w-auto">
              <option value="">所有年份</option>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y} 年
                </option>
              ))}
            </Select>
            <Select name="sort" defaultValue={sort} className="w-auto">
              <option value="recent">最新经历优先</option>
              <option value="helpful">最有帮助</option>
            </Select>
            <button className="col-span-2 rounded-xl bg-paper px-4 py-2.5 text-sm font-medium shadow-[var(--shadow-soft)] hover:bg-stone-50 sm:col-span-1">筛选</button>
          </form>
        )}
      </div>

      {posts.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {posts.map((p) => (
            <PostCard key={p.id} post={p} showStatus={tab === "mine"} />
          ))}
        </div>
      ) : tab === "mine" ? (
        <EmptyState
          title="你还没有分享过经验"
          action={
            <Link href="/community/new" className="text-sm font-medium text-sakura-600 hover:underline">
              写第一篇 →
            </Link>
          }
        >
          只要大致描述一下，AI 会帮你整理成通顺的文章，你修改确认后才会发布。
        </EmptyState>
      ) : (
        <EmptyState title={sp.q || year ? "没有找到符合条件的分享" : "还没有人分享"}>
          {sp.q || year ? (
            <Link href={link({ q: "", year: "" })} className="text-sakura-600 hover:underline">
              清除筛选
            </Link>
          ) : (
            "成为第一个分享的人吧，你的经历对后来者很有价值。"
          )}
        </EmptyState>
      )}
    </>
  );
}
