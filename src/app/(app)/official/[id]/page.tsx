import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ExternalLink } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getOfficial } from "@/lib/watch";
import { formatOpeningDate } from "@/lib/openings-shared";
import { ITEM_KINDS, WATCH_PHASES, roundText } from "@/lib/watch-shared";
import { Badge, Card } from "@/components/ui";
import { TrackOfficial } from "./track-button";

export const metadata = { title: "官方选考日程" };

export default async function OfficialPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const s = await getOfficial(id, user);
  if (!s) notFound();
  const round = roundText(s);
  const phase = WATCH_PHASES[s.phase];

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Link href="/tracker?view=calendar" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ChevronLeft className="size-4" /> 选考日历
      </Link>
      <div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="violet">官方</Badge>
          {s.withdrawn ? <Badge tone="rose">已撤回</Badge> : <Badge tone={phase.tone}>{phase.label}</Badge>}
          {round && <Badge tone="violet">{round}</Badge>}
          {s.grad_year ? <Badge>{s.grad_year} 届</Badge> : <Badge>不限届</Badge>}
        </div>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">{s.company_name} · 本选考日程</h1>
        <p className="mt-1 text-sm text-muted">
          由管理员整理发布 · 更新于 {new Date(s.updated_at).toLocaleDateString("zh-CN")} · 以公司官方信息为准
        </p>
      </div>

      <Card className="space-y-3">
        {s.items.length ? (
          <ul className="divide-y divide-line">
            {s.items.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-2 py-2.5 text-sm">
                <Badge tone={ITEM_KINDS[i.kind]?.tone}>{ITEM_KINDS[i.kind]?.label ?? i.kind}</Badge>
                <span className="font-medium tabular-nums">{formatOpeningDate(i.starts_at)}</span>
                <span>{i.title}</span>
                {i.location && <span className="w-full truncate text-xs text-muted">{i.location}</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">还没有具体日期。</p>
        )}
        {s.note && <p className="whitespace-pre-wrap rounded-xl bg-cream/60 px-3 py-2 text-sm">{s.note}</p>}
        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3">
          {!s.withdrawn && <TrackOfficial id={s.id} trackedCompanyId={s.tracked_company_id} />}
          {s.entry_url && (
            <a href={s.entry_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-sakura-600 hover:underline">
              エントリー / 采用页 <ExternalLink className="size-3.5" />
            </a>
          )}
        </div>
        <p className="text-xs text-muted">
          官方日程和你自己的日程分开显示（日历上标有「官方」）。加入选考追踪后会复制一份到你自己的公司卡片里，之后可以自由修改，官方那份就不再重复显示。
        </p>
      </Card>
    </div>
  );
}
