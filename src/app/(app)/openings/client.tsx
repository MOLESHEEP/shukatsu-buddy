"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, Check, ExternalLink, PenLine, Star, Undo2, X } from "lucide-react";
import { Badge, Button, Card, EmptyState, Input, cx } from "@/components/ui";
import { api, errMsg } from "@/lib/client";
import { PHASES, formatOpeningDate, openingPhase, type Opening } from "@/lib/openings-shared";
import type { MyReport } from "@/lib/openings";

export function FollowButton({ name, companyKey, following, size = "sm" }: { name: string; companyKey: string; following: boolean; size?: "sm" | "md" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function toggle() {
    setBusy(true);
    try {
      if (following) await api("/api/openings/follow", { method: "DELETE", body: { key: companyKey } });
      else await api("/api/openings/follow", { body: { company_name: name } });
      router.refresh();
    } catch (e) {
      alert(errMsg(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button size={size} variant={following ? "soft" : "ghost"} loading={busy} onClick={toggle} title={following ? "取消关注" : "开放或更新时通知我"}>
      <Star className={cx("size-3.5", following && "fill-current")} />
      {following ? "已关注" : "关注"}
    </Button>
  );
}

export function OpeningCard({ o, focused = false }: { o: Opening; focused?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState<number | null>(null);
  const phase = PHASES[openingPhase(o)];

  async function track() {
    setBusy(true);
    try {
      const r = await api<{ companyId: number }>(`/api/openings/${o.id}/track`, { method: "POST" });
      setAdded(r.companyId);
      router.refresh();
    } catch (e) {
      alert(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card id={`o-${o.id}`} className={cx("scroll-mt-24 space-y-3", focused && "border-sakura-300 ring-4 ring-sakura-50")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone={phase.tone}>{phase.label}</Badge>
            {o.grad_year ? <Badge tone="violet">{o.grad_year} 届</Badge> : <Badge>不限届</Badge>}
          </div>
          <h2 className="mt-1.5 truncate font-semibold">{o.company_name}</h2>
        </div>
        <FollowButton name={o.company_name} companyKey={o.company_key} following={o.following} />
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted">开放</dt>
        <dd>{o.opens_at ? formatOpeningDate(o.opens_at) : <span className="text-muted">未知</span>}</dd>
        <dt className="text-muted">截止</dt>
        <dd>{o.deadline ? formatOpeningDate(o.deadline) : <span className="text-muted">未公布</span>}</dd>
      </dl>
      {o.note && <p className="whitespace-pre-wrap rounded-xl bg-cream/60 px-3 py-2 text-sm">{o.note}</p>}

      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
        {added ? (
          <Link href={`/tracker/${added}`} className="inline-flex items-center gap-1 text-sm font-medium text-mint-700 hover:underline">
            <Check className="size-4" /> 已加入选考追踪
          </Link>
        ) : (
          <Button size="sm" variant="soft" loading={busy} onClick={track}>
            <CalendarPlus className="size-3.5" /> 加入选考追踪
          </Button>
        )}
        {o.url && (
          <a href={o.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-sakura-600 hover:underline">
            采用页 <ExternalLink className="size-3.5" />
          </a>
        )}
        <Link href={`/openings/new?opening=${o.id}`} className="ml-auto inline-flex items-center gap-1 text-xs text-muted hover:text-ink">
          <PenLine className="size-3" /> 纠错 / 补充
        </Link>
      </div>
      <p className="text-xs text-muted">
        {o.source === "admin" ? "管理员整理" : o.reporter_name ? `${o.reporter_name} 上报` : "同学匿名上报"} · 更新于 {new Date(o.updated_at).toLocaleDateString("zh-CN")} · 以公司官方信息为准
      </p>
    </Card>
  );
}

export function FollowManager({ follows }: { follows: { company_key: string; company_name: string }[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function run(fn: () => Promise<string | null>) {
    setBusy(true);
    setMsg(null);
    try {
      setMsg(await fn());
      router.refresh();
    } catch (e) {
      setMsg(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mb-5 space-y-3">
      <div>
        <h2 className="font-semibold">关注的公司</h2>
        <p className="mt-0.5 text-xs text-muted">这些公司的本选考开放或信息更新时，会在「通知」里提醒你（只提醒和你同届或不限届的信息）。</p>
      </div>
      {follows.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {follows.map((f) => (
            <span key={f.company_key} className="inline-flex items-center gap-1 rounded-full bg-lemon-50 py-1 pr-1 pl-3 text-sm text-lemon-700">
              {f.company_name}
              <button
                disabled={busy}
                onClick={() => run(async () => (await api("/api/openings/follow", { method: "DELETE", body: { key: f.company_key } }), null))}
                className="rounded-full p-0.5 hover:bg-lemon-100"
                aria-label={`取消关注 ${f.company_name}`}
              >
                <X className="size-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          run(async () => {
            await api("/api/openings/follow", { body: { company_name: name } });
            setName("");
            return null;
          });
        }}
      >
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="输入公司名关注，如 トヨタ自動車" className="min-w-0 flex-1" maxLength={100} />
        <Button size="sm" type="submit" disabled={busy || !name.trim()}>
          关注
        </Button>
        <Button
          size="sm"
          type="button"
          variant="soft"
          disabled={busy}
          onClick={() =>
            run(async () => {
              const r = await api<{ added: number }>("/api/openings/follow", { body: { from_tracker: true } });
              return r.added ? `已关注选考追踪里的 ${r.added} 家公司` : "选考追踪里进行中的公司都已经关注了";
            })
          }
        >
          一键关注选考追踪里的公司
        </Button>
      </form>
      {msg && <p className="text-xs text-muted">{msg}</p>}
    </Card>
  );
}

const REPORT_STATUS: Record<MyReport["status"], { label: string; tone: string }> = {
  pending: { label: "审核中", tone: "lemon" },
  approved: { label: "已公开", tone: "mint" },
  rejected: { label: "未通过", tone: "rose" },
};

export function MyReports({ reports }: { reports: MyReport[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<number | null>(null);

  async function withdraw(id: number) {
    if (!confirm("撤回这条上报？")) return;
    setBusy(id);
    try {
      await api(`/api/openings/reports/${id}`, { method: "DELETE" });
      router.refresh();
    } catch (e) {
      alert(errMsg(e));
    } finally {
      setBusy(null);
    }
  }

  if (!reports.length) {
    return (
      <EmptyState
        title="你还没有公开上报过"
        action={
          <Link href="/openings/new" className="text-sm font-medium text-sakura-600 hover:underline">
            上报开放信息 →
          </Link>
        }
      >
        公开上报通过审核后会通知关注这家公司的同学，并获得 1 point。「仅自己可见」的上报直接写进你的选考追踪，不会出现在这里。
      </EmptyState>
    );
  }
  return (
    <Card className="divide-y divide-line p-0">
      {reports.map((r) => {
        const st = REPORT_STATUS[r.status];
        return (
          <div key={r.id} className="space-y-1 px-5 py-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge tone={st.tone}>{st.label}</Badge>
              {r.reward === "awarded" && <Badge tone="mint">+1 point</Badge>}
              <span className="font-medium">{r.company_name}</span>
              {r.grad_year && <span className="text-xs text-muted">{r.grad_year} 届</span>}
              <span className="ml-auto text-xs text-muted">{new Date(r.created_at).toLocaleDateString("zh-CN")}</span>
            </div>
            <p className="text-sm text-muted">
              {[r.opens_at && `开放 ${formatOpeningDate(r.opens_at)}`, r.deadline && `截止 ${formatOpeningDate(r.deadline)}`].filter(Boolean).join(" · ")}
            </p>
            {r.status === "rejected" && r.review_note && <p className="rounded-xl bg-sakura-50 px-3 py-2 text-xs text-sakura-700">{r.review_note}</p>}
            <div className="flex gap-3 text-xs">
              {r.status === "approved" && r.opening_id && (
                <Link href={`/openings?focus=${r.opening_id}#o-${r.opening_id}`} className="text-sakura-600 hover:underline">
                  查看公开信息
                </Link>
              )}
              {r.status === "pending" && (
                <button disabled={busy === r.id} onClick={() => withdraw(r.id)} className="inline-flex items-center gap-1 text-muted hover:text-ink">
                  <Undo2 className="size-3" /> 撤回
                </button>
              )}
            </div>
          </div>
        );
      })}
    </Card>
  );
}
