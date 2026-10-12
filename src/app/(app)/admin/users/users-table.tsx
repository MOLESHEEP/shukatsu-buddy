"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, ChevronDown, RotateCcw, ShieldCheck, Sparkles } from "lucide-react";
import { Badge, Button, EmptyState, Input, cx } from "@/components/ui";
import { api, errMsg } from "@/lib/client";
import type { AdminUserRow } from "@/lib/admin";

type Defaults = { ai: boolean; es: number; email: number; post: number };

export function UsersTable({ users, meId, defaults }: { users: AdminUserRow[]; meId: number; defaults: Defaults }) {
  if (!users.length) return <EmptyState title="没有符合条件的用户" />;
  return (
    <div className="space-y-2">
      {users.map((u) => (
        <UserRow key={u.id} u={u} isMe={u.id === meId} defaults={defaults} />
      ))}
    </div>
  );
}

function UserRow({ u, isMe, defaults }: { u: AdminUserRow; isMe: boolean; defaults: Defaults }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limits, setLimits] = useState({
    limit_es: u.limit_es?.toString() ?? "",
    limit_email: u.limit_email?.toString() ?? "",
    limit_post: u.limit_post?.toString() ?? "",
  });
  const admin = u.role === "admin";
  const aiOn = admin || (u.ai_enabled ?? defaults.ai);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/admin/users/${u.id}`, { method: "PATCH", body });
      router.refresh();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  const effective = (own: number | null, d: number) => (own ?? d);
  const usage = [
    { label: "ES", used: u.today_es, limit: effective(u.limit_es, defaults.es) },
    { label: "邮件", used: u.today_email, limit: effective(u.limit_email, defaults.email) },
    { label: "经验", used: u.today_post, limit: effective(u.limit_post, defaults.post) },
  ];

  return (
    <div className={cx("rounded-2xl border bg-paper p-3.5 shadow-[var(--shadow-soft)]", u.status === "banned" ? "border-sakura-100 opacity-70" : "border-line")}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="rounded-lg bg-stone-50 px-2 py-0.5 font-mono text-xs text-muted">ID {u.id}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate font-medium">{u.display_name || "（未填名字）"}</span>
            {admin && <Badge tone="violet">管理员</Badge>}
            {u.status === "banned" && <Badge tone="rose">已停用</Badge>}
            {u.career_stage === "working" && <Badge tone="mint">在职</Badge>}
            {u.grad_year && <span className="text-xs text-muted">{String(u.grad_year).slice(-2)}届</span>}
          </div>
          <div className="truncate text-xs text-muted">
            {u.email} · 注册 {new Date(u.created_at).toLocaleDateString("zh-CN")}
            {u.last_seen_at && ` · 最近活跃 ${new Date(u.last_seen_at).toLocaleDateString("zh-CN")}`}
          </div>
        </div>

        {/* AI switch: the core admin action */}
        {admin ? (
          <Badge tone="violet">
            <Sparkles className="size-3" /> AI 不受限
          </Badge>
        ) : (
          <div className="flex items-center gap-1 rounded-full bg-stone-50 p-0.5 text-xs">
            {[
              { v: true, label: "开通" },
              { v: false, label: "关闭" },
              { v: null, label: `默认(${defaults.ai ? "开" : "关"})` },
            ].map((o) => (
              <button
                key={String(o.v)}
                disabled={busy}
                onClick={() => patch({ ai_enabled: o.v })}
                className={cx(
                  "rounded-full px-2.5 py-1 font-medium transition",
                  u.ai_enabled === o.v ? (o.v === true ? "bg-mint-500 text-white" : o.v === false ? "bg-stone-500 text-white" : "bg-paper text-ink shadow-sm") : "text-muted hover:text-ink",
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
        )}
        <Badge tone={aiOn ? "mint" : "stone"}>{aiOn ? "可用 AI" : "无 AI"}</Badge>

        <div className="hidden gap-2 text-xs tabular-nums text-muted md:flex">
          {usage.map((x) => (
            <span key={x.label} className={cx(!admin && x.used >= x.limit && "font-medium text-sakura-600")}>
              {x.label} {x.used}/{admin ? "∞" : x.limit}
            </span>
          ))}
        </div>
        <button onClick={() => setOpen((o) => !o)} className="rounded-lg p-1.5 text-muted hover:bg-stone-50" aria-label="更多">
          <ChevronDown className={cx("size-4 transition", open && "rotate-180")} />
        </button>
      </div>

      {open && (
        <div className="mt-3 grid gap-3 border-t border-line pt-3 sm:grid-cols-[1fr_auto]">
          <div>
            <p className="text-xs font-medium">每日额度（留空 = 用默认值）</p>
            <div className="mt-1.5 grid grid-cols-3 gap-2">
              {(
                [
                  ["limit_es", "ES 添削", defaults.es],
                  ["limit_email", "邮件助手", defaults.email],
                  ["limit_post", "经验整理", defaults.post],
                ] as const
              ).map(([k, label, d]) => (
                <label key={k} className="text-xs text-muted">
                  {label}
                  <Input type="number" min={0} className="mt-1 py-1.5" placeholder={`默认 ${d}`} value={limits[k]} onChange={(e) => setLimits((s) => ({ ...s, [k]: e.target.value }))} />
                </label>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-muted">
              今日已用：{usage.map((x) => `${x.label} ${x.used}`).join(" · ")} · 累计 AI 调用 {u.total_ai} 次 · 发帖 {u.posts}
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <Button
              size="sm"
              variant="soft"
              disabled={busy}
              onClick={() =>
                patch({
                  limit_es: limits.limit_es === "" ? null : Number(limits.limit_es),
                  limit_email: limits.limit_email === "" ? null : Number(limits.limit_email),
                  limit_post: limits.limit_post === "" ? null : Number(limits.limit_post),
                })
              }
            >
              保存额度
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => patch({ reset_today: true })} title="清零今天已用次数">
              <RotateCcw className="size-3.5" /> 重置今日次数
            </Button>
            {!admin && !isMe && (
              <Button
                size="sm"
                variant="danger"
                disabled={busy}
                onClick={() => {
                  if (u.status === "active" && !confirm(`停用 ${u.email}？停用后无法登录，发布的分享也会对其他人隐藏。`)) return;
                  patch({ status: u.status === "active" ? "banned" : "active" });
                }}
              >
                {u.status === "active" ? (
                  <>
                    <Ban className="size-3.5" /> 停用账号
                  </>
                ) : (
                  <>
                    <ShieldCheck className="size-3.5" /> 恢复账号
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-sakura-700">{error}</p>}
    </div>
  );
}
