"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, Check, ChevronDown, Coins, Copy, Crown, KeyRound, Radar, RotateCcw, ShieldCheck, ShieldMinus, ShieldPlus, Sparkles } from "lucide-react";
import { Badge, Button, EmptyState, Input, cx } from "@/components/ui";
import { api, errMsg } from "@/lib/client";
import type { AdminUserRow } from "@/lib/admin";

type Defaults = { ai: boolean; es: number; email: number; post: number };

export function UsersTable({ users, meId, defaults, viewerSuper }: { users: AdminUserRow[]; meId: number; defaults: Defaults; viewerSuper: boolean }) {
  if (!users.length) return <EmptyState title="没有符合条件的用户" />;
  return (
    <div className="space-y-2">
      {users.map((u) => (
        <UserRow key={u.id} u={u} isMe={u.id === meId} defaults={defaults} viewerSuper={viewerSuper} />
      ))}
    </div>
  );
}

function UserRow({ u, isMe, defaults, viewerSuper }: { u: AdminUserRow; isMe: boolean; defaults: Defaults; viewerSuper: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limits, setLimits] = useState({
    limit_es: u.limit_es?.toString() ?? "",
    limit_email: u.limit_email?.toString() ?? "",
    limit_post: u.limit_post?.toString() ?? "",
  });
  const [resetLink, setResetLink] = useState<string | null>(null);
  const [adjust, setAdjust] = useState({ delta: "", note: "" });
  const [copied, setCopied] = useState(false);
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

  async function setRole(role: "admin" | "user") {
    const msg =
      role === "admin"
        ? `把 ${u.email} 设为管理员？对方将可以管理用户、内容、通知和 AI 设置（但不能授予或取消他人的管理员权限）。`
        : `取消 ${u.email} 的管理员权限？对方会立即变回普通用户。`;
    if (!confirm(msg)) return;
    await patch({ role });
  }

  async function adjustPoints() {
    const delta = Number(adjust.delta);
    if (!Number.isInteger(delta) || !delta) return setError("请输入非 0 的整数（负数为扣除）");
    if (!adjust.note.trim()) return setError("请写明调整原因（会记录在用户的 point 明细里）");
    if (!confirm(`${delta > 0 ? "给" : "从"} ${u.email} ${delta > 0 ? "增加" : "扣除"} ${Math.abs(delta)} point？`)) return;
    setBusy(true);
    setError(null);
    try {
      await api("/api/admin/points", { body: { user_id: u.id, delta, note: adjust.note } });
      setAdjust({ delta: "", note: "" });
      router.refresh();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  async function makeResetLink() {
    if (!confirm(`为 ${u.email} 生成重置密码链接？链接 24 小时内有效、只能用一次，请通过可信的渠道发给本人。`)) return;
    setBusy(true);
    setError(null);
    try {
      setResetLink((await api<{ link: string }>(`/api/admin/users/${u.id}/reset-link`, { method: "POST" })).link);
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
            {u.is_super ? (
              <Badge tone="lemon">
                <Crown className="size-3" /> 超级管理员
              </Badge>
            ) : (
              admin && <Badge tone="violet">管理员</Badge>
            )}
            {isMe && <Badge tone="sky">我</Badge>}
            {u.status === "banned" && <Badge tone="rose">已停用</Badge>}
            {u.career_stage === "working" && <Badge tone="mint">在职</Badge>}
            {u.grad_year && <span className="text-xs text-muted">{String(u.grad_year).slice(-2)}届</span>}
          </div>
          <div className="truncate text-xs text-muted">
            {u.email} · 注册 {new Date(u.created_at).toLocaleDateString("zh-CN")}
            {u.last_seen_at && ` · 最近活跃 ${new Date(u.last_seen_at).toLocaleDateString("zh-CN")}`}
            {admin && (u.env_admin ? " · 服务器配置的管理员" : u.granted_by_email ? ` · 由 ${u.granted_by_email} 于 ${new Date(u.role_granted_at!).toLocaleDateString("zh-CN")} 授予` : "")}
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
        {!admin && u.watch_enabled && (
          <Badge tone="sky">
            <Radar className="size-3" /> 网页监控
          </Badge>
        )}
        <Badge tone="lemon">
          <Coins className="size-3" /> {u.points}
        </Badge>

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
              今日已用：{usage.map((x) => `${x.label} ${x.used}`).join(" · ")} · 累计 AI 调用 {u.total_ai} 次 · 发帖 {u.posts} · point {u.points}
            </p>
            {viewerSuper && (
              <div className="mt-2.5">
                <p className="text-xs font-medium">调整 point（超级管理员）</p>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  <Input type="number" className="w-24 py-1.5" placeholder="+5 / -2" value={adjust.delta} onChange={(e) => setAdjust((s) => ({ ...s, delta: e.target.value }))} />
                  <Input className="w-auto min-w-0 flex-1 py-1.5" maxLength={200} placeholder="原因，例如：补发 / 活动奖励" value={adjust.note} onChange={(e) => setAdjust((s) => ({ ...s, note: e.target.value }))} />
                  <Button size="sm" variant="soft" disabled={busy || !adjust.delta} onClick={adjustPoints}>
                    调整
                  </Button>
                </div>
              </div>
            )}
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
            {viewerSuper && !isMe && !u.env_admin && u.status === "active" && (
              <Button size="sm" variant={admin ? "danger" : "soft"} disabled={busy} onClick={() => setRole(admin ? "user" : "admin")}>
                {admin ? <ShieldMinus className="size-3.5" /> : <ShieldPlus className="size-3.5" />}
                {admin ? "取消管理员" : "设为管理员"}
              </Button>
            )}
            {(!admin || isMe || (viewerSuper && !u.env_admin)) && u.status === "active" && (
              <Button size="sm" variant="ghost" disabled={busy} onClick={makeResetLink} title="用户忘记密码时使用">
                <KeyRound className="size-3.5" /> 重置密码链接
              </Button>
            )}
            {!admin && u.status === "active" && (
              <Button
                size="sm"
                variant={u.watch_enabled ? "danger" : "soft"}
                disabled={busy}
                onClick={() => patch({ watch_enabled: !u.watch_enabled })}
                title="网页监控：订阅公司采用页，AI 识别本选考开放与日程（只加到本人的选考追踪，不能向他人发布）"
              >
                <Radar className="size-3.5" /> {u.watch_enabled ? "关闭网页监控" : "开通网页监控"}
              </Button>
            )}
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
      {resetLink && (
        <div className="mt-3 rounded-xl bg-lemon-50 px-3 py-2.5 text-xs text-lemon-700">
          <p>把这个链接发给 {u.email}（24 小时内有效、只能用一次）。对方设置新密码后，其他设备上的登录会全部退出。</p>
          <div className="mt-1.5 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded bg-paper px-2 py-1 font-mono">{resetLink}</code>
            <button
              onClick={async () => {
                await navigator.clipboard.writeText(resetLink);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="shrink-0 rounded-lg p-1.5 hover:bg-paper"
              aria-label="复制"
            >
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            </button>
          </div>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-sakura-700">{error}</p>}
    </div>
  );
}
