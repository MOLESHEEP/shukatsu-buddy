"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, Check, ChevronDown, Crown, ExternalLink, UserCheck, X } from "lucide-react";
import { Badge, Button, Card, EmptyState, Input, Textarea, cx } from "@/components/ui";
import { PostBody } from "@/components/post-view";
import { api, errMsg } from "@/lib/client";
import { POST_KINDS } from "@/lib/community";
import type { ReviewRow } from "@/lib/review";
import type { PointSettings } from "@/lib/points";

export function PointSettingsCard({ settings, viewerSuper, demo }: { settings: PointSettings; viewerSuper: boolean; demo: boolean }) {
  const router = useRouter();
  const [cap, setCap] = useState(String(settings.dailyCap));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save(body: Partial<PointSettings>) {
    setBusy(true);
    setMsg(null);
    try {
      await api("/api/admin/points", { method: "PUT", body });
      setMsg("已保存");
      router.refresh();
    } catch (e) {
      setMsg(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="grid gap-4 sm:grid-cols-2">
      <div>
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <Bot className="size-4 text-violet-500" /> AI 自动审核
        </p>
        <p className="mt-1 text-xs text-muted">
          用户发布后先由 AI 检查：有效经验、无反动 / 色情 / 暴力 / 营销 / 诋毁 / 人身攻击 / 隐私泄露。明确合规自动通过并发 point，明确违规自动驳回，拿不准的留在这里等人工。
          {demo && <span className="text-lemon-700"> 当前是演示模式（没有配置 AI），所有分享都需要人工审核。</span>}
        </p>
        <div className="mt-2 flex gap-1 rounded-full bg-stone-50 p-0.5 text-xs w-fit">
          {[true, false].map((v) => (
            <button
              key={String(v)}
              disabled={busy}
              onClick={() => save({ aiReview: v })}
              className={cx("rounded-full px-3 py-1 font-medium transition", settings.aiReview === v ? (v ? "bg-mint-500 text-white" : "bg-stone-500 text-white") : "text-muted hover:text-ink")}
            >
              {v ? "开启" : "关闭（全部人工）"}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <Crown className="size-4 text-lemon-500" /> 每人每天最多获得 point
        </p>
        <p className="mt-1 text-xs text-muted">每篇通过审核的分享 +1 point（同一篇只奖励一次）。达到上限后当天再通过的分享照常公开，但不计分。{viewerSuper ? "" : " 只有超级管理员可以修改。"}</p>
        <div className="mt-2 flex items-center gap-2">
          <Input type="number" min={0} max={100} value={cap} onChange={(e) => setCap(e.target.value)} disabled={!viewerSuper || busy} className="w-24 py-1.5" />
          <span className="text-sm text-muted">点 / 天</span>
          {viewerSuper && (
            <Button size="sm" variant="soft" disabled={busy || cap === String(settings.dailyCap) || cap === ""} onClick={() => save({ dailyCap: Number(cap) })}>
              保存
            </Button>
          )}
        </div>
      </div>
      {msg && <p className="text-xs text-muted sm:col-span-2">{msg}</p>}
    </Card>
  );
}

const REWARD: Record<string, string> = { awarded: "+1 point", capped: "已达上限未计分" };

export function ReviewQueue({ rows, status }: { rows: ReviewRow[]; status: string }) {
  if (!rows.length) {
    return (
      <EmptyState title={status === "pending" ? "没有待审核的分享 🎉" : "这里还没有记录"}>
        {status === "pending" ? "AI 拿不准、AI 审核关闭或失败时，分享会留在这里等你处理。" : null}
      </EmptyState>
    );
  }
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <ReviewItem key={r.id} r={r} />
      ))}
    </div>
  );
}

function ReviewItem({ r }: { r: ReviewRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(r.status === "pending");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const kind = POST_KINDS[r.kind];

  async function act(action: "approve" | "reject") {
    if (action === "reject" && !note.trim() && !confirm("没有填写驳回原因，作者只会看到「不符合社区规则」。继续？")) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/admin/review/${r.id}`, { method: "PATCH", body: { action, note } });
      router.refresh();
    } catch (e) {
      setError(errMsg(e));
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-line bg-paper p-4 shadow-[var(--shadow-soft)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone={kind.tone}>
              {kind.emoji} {kind.label}
            </Badge>
            {r.review_by && (
              <Badge tone={r.review_by === "ai" ? "violet" : "sky"}>
                {r.review_by === "ai" ? <Bot className="size-3" /> : <UserCheck className="size-3" />}
                {r.review_by === "ai" ? "AI" : (r.reviewer_email ?? "管理员")}
              </Badge>
            )}
            {REWARD[r.reward] && <Badge tone="mint">{REWARD[r.reward]}</Badge>}
          </div>
          <button onClick={() => setOpen((o) => !o)} className="mt-1.5 flex items-center gap-1 text-left font-medium hover:text-sakura-600">
            {r.title}
            <ChevronDown className={cx("size-4 shrink-0 transition", open && "rotate-180")} />
          </button>
          <p className="text-xs text-muted">
            {r.company_name}
            {r.role && ` · ${r.role}`} · 作者 {r.author_email}（ID {r.author_id}）
            {r.submitted_at && ` · 提交于 ${new Date(r.submitted_at).toLocaleString("zh-CN")}`}
          </p>
          {r.review_note && <p className="mt-2 rounded-xl bg-stone-50 px-3 py-2 text-xs text-ink">{r.review_note}</p>}
        </div>
        <Link href={`/community/${r.id}`} target="_blank" className="rounded-lg p-1.5 text-muted hover:bg-stone-50" aria-label="打开原文">
          <ExternalLink className="size-4" />
        </Link>
      </div>

      {open && (
        <div className="mt-3 space-y-3 border-t border-line pt-3">
          <div className="max-h-96 overflow-y-auto rounded-xl bg-cream/50 p-3 text-sm">
            <PostBody body={r.body} />
            {r.tags.length > 0 && <p className="mt-3 text-xs text-muted">{r.tags.map((t) => `#${t}`).join(" ")}</p>}
          </div>
          {r.status !== "published" && (
            <>
              {r.status === "pending" && (
                <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="驳回原因（会通知作者，告诉对方怎么改）" />
              )}
              <div className="flex flex-wrap justify-end gap-2">
                {r.status === "pending" && (
                  <Button size="sm" variant="danger" disabled={busy} onClick={() => act("reject")}>
                    <X className="size-3.5" /> 驳回
                  </Button>
                )}
                <Button size="sm" disabled={busy} onClick={() => act("approve")}>
                  <Check className="size-3.5" /> {r.status === "rejected" ? "改判通过并发 point" : "通过并发 point"}
                </Button>
              </div>
            </>
          )}
          {error && <p className="text-xs text-sakura-700">{error}</p>}
        </div>
      )}
    </div>
  );
}
