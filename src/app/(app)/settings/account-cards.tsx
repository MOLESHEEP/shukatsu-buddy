"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Badge, Button, Card, ErrorNote, Field, Input } from "@/components/ui";
import { api, errMsg } from "@/lib/client";

type Quota = { unlimited: boolean; used: { es: number; email: number; post: number }; limit: { es: number; email: number; post: number }; points: number; autoPoints: boolean };

export function AiStatusCard({ userId, isAdmin, ai, quota }: { userId: number; isAdmin: boolean; ai: { allowed: boolean; demo: boolean }; quota: Quota }) {
  const [copied, setCopied] = useState(false);
  const rows = [
    { k: "es" as const, label: "ES 添削" },
    { k: "email" as const, label: "邮件助手" },
    { k: "post" as const, label: "经验整理" },
  ];
  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">🤖 AI 功能</h2>
        {isAdmin ? <Badge tone="violet">管理员 · 不限次数</Badge> : ai.allowed ? <Badge tone="mint">已开通</Badge> : <Badge tone="stone">未开通</Badge>}
      </div>
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted">我的用户 ID</span>
        <code className="rounded-lg bg-stone-50 px-2 py-0.5 font-mono font-semibold">{userId}</code>
        <button
          onClick={async () => {
            await navigator.clipboard.writeText(String(userId));
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="rounded-lg p-1 text-muted hover:bg-stone-50"
          aria-label="复制用户 ID"
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        </button>
      </div>
      {!ai.allowed && (
        <p className="rounded-xl bg-lemon-50 px-3 py-2 text-xs text-lemon-700">
          AI 功能需要管理员开通：把上面的用户 ID 发给管理员即可。在此之前，你仍然可以手动写 ES 并保存、使用选考追踪和日历，以及自己撰写经验分享。
        </p>
      )}
      {ai.allowed && !isAdmin && (
        <div>
          <p className="text-xs text-muted">今天的使用次数（每天 0 点重置）</p>
          <div className="mt-1.5 grid grid-cols-3 gap-2">
            {rows.map((r) => {
              const left = Math.max(0, quota.limit[r.k] - quota.used[r.k]);
              return (
                <div key={r.k} className={`rounded-xl px-3 py-2 ${left ? "bg-mint-50 text-mint-700" : "bg-sakura-50 text-sakura-700"}`}>
                  <div className="text-lg font-bold tabular-nums">
                    {quota.used[r.k]}
                    <span className="text-xs font-normal opacity-70"> / {quota.limit[r.k]}</span>
                  </div>
                  <div className="text-xs opacity-80">{r.label}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {ai.allowed && !isAdmin && (
        <Link href="/points" className="flex items-center justify-between rounded-xl bg-lemon-50 px-3 py-2 text-xs text-lemon-700 hover:bg-lemon-100">
          <span>
            🪙 point 余额 <b className="tabular-nums">{quota.points}</b> · 免费次数用完后{quota.autoPoints ? "自动用 point 继续" : "不使用 point"}
          </span>
          <span>Point Market →</span>
        </Link>
      )}
      {ai.demo && <p className="text-xs text-violet-700">当前站点处于演示模式，AI 返回示例结果。</p>}
      {isAdmin ? (
        <Link href="/admin/ai" className="inline-block text-sm font-medium text-sakura-600 hover:underline">
          管理 AI 服务、模型和额度 →
        </Link>
      ) : (
        <Link href="/feedback?from=/settings" className="inline-block text-xs text-muted hover:text-sakura-600">
          对 AI 功能或次数有建议？去「意见反馈」告诉管理员 →
        </Link>
      )}
    </Card>
  );
}

export function PasswordCard() {
  const [form, setForm] = useState({ current: "", next: "", confirm: "" });
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (form.next !== form.confirm) return setError("两次输入的新密码不一致");
    setBusy(true);
    try {
      await api("/api/me/password", { method: "POST", body: { current: form.current, next: form.next } });
      setDone(true);
      setForm({ current: "", next: "", confirm: "" });
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <form onSubmit={submit} className="space-y-3">
        <h2 className="font-semibold">🔑 修改密码</h2>
        <Field label="当前密码">
          <Input type="password" autoComplete="current-password" required value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="新密码" hint="至少 8 位">
            <Input type="password" autoComplete="new-password" required minLength={8} value={form.next} onChange={(e) => setForm({ ...form, next: e.target.value })} />
          </Field>
          <Field label="再输一次">
            <Input type="password" autoComplete="new-password" required minLength={8} value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} />
          </Field>
        </div>
        <ErrorNote message={error} />
        <Button type="submit" variant="soft" loading={busy}>
          {done ? "已修改 ✓" : "修改密码"}
        </Button>
      </form>
    </Card>
  );
}
