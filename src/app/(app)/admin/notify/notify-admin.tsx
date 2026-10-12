"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Megaphone, Send, Trash2, Undo2 } from "lucide-react";
import { Badge, Button, Card, EmptyState, ErrorNote, Field, Input, Textarea, cx } from "@/components/ui";
import { api, errMsg } from "@/lib/client";

export type SentRow = {
  id: number;
  title: string;
  body: string;
  link: string;
  level: "info" | "important";
  audience: "all" | "ids";
  user_ids: number[];
  withdrawn: boolean;
  created_at: string;
  reads: number;
  reach: number;
};

export function NotifyAdmin({ sent, activeUsers }: { sent: SentRow[]; activeUsers: number }) {
  const router = useRouter();
  const [f, setF] = useState({ title: "", body: "", link: "", level: "info" as "info" | "important", audience: "all" as "all" | "ids", ids: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const ids = f.ids
    .split(/[,，、\s]+/)
    .map((s) => Number(s))
    .filter((n) => Number.isInteger(n) && n > 0);
  const reach = f.audience === "all" ? activeUsers : ids.length;

  async function send() {
    if (!confirm(`发送给${f.audience === "all" ? `所有用户（${activeUsers} 人）` : `${ids.length} 位用户`}？发送后可以撤回，但已读的用户已经看到了。`)) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ reach: number }>("/api/admin/announcements", {
        body: { title: f.title, body: f.body, link: f.link, level: f.level, audience: f.audience, user_ids: ids },
      });
      setDone(`已发送给 ${r.reach} 位用户`);
      setF({ title: "", body: "", link: "", level: "info", audience: f.audience, ids: "" });
      router.refresh();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }
  async function act(id: number, kind: "withdraw" | "restore" | "delete") {
    if (kind === "delete" && !confirm("彻底删除这条通知？")) return;
    await api(`/api/admin/announcements/${id}`, kind === "delete" ? { method: "DELETE" } : { method: "PATCH", body: { withdrawn: kind === "withdraw" } });
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <Card className="space-y-4">
          <h2 className="font-semibold">发送通知</h2>
          <div className="grid grid-cols-2 gap-2">
            {[
              { v: "all" as const, label: `所有用户（${activeUsers} 人）` },
              { v: "ids" as const, label: "指定用户 ID" },
            ].map((o) => (
              <button
                key={o.v}
                type="button"
                onClick={() => setF({ ...f, audience: o.v })}
                className={cx("rounded-xl border px-3 py-2.5 text-sm transition", f.audience === o.v ? "border-sakura-300 bg-sakura-50 font-medium text-sakura-700" : "border-line text-muted hover:bg-stone-50")}
              >
                {o.label}
              </button>
            ))}
          </div>
          {f.audience === "ids" && (
            <Field label="用户 ID" hint={`已识别 ${ids.length} 个`}>
              <Input value={f.ids} onChange={(e) => setF({ ...f, ids: e.target.value })} placeholder="例：25, 31, 42（用逗号或空格分隔）" className="font-mono" />
            </Field>
          )}
          <Field label="标题">
            <Input value={f.title} maxLength={80} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="例：AI 添削次数提升到每天 20 次 🎉" />
          </Field>
          <Field label="内容" hint="可选">
            <Textarea rows={5} value={f.body} maxLength={3000} onChange={(e) => setF({ ...f, body: e.target.value })} placeholder="详细说明…" />
          </Field>
          <Field label="链接" hint="可选：站内路径如 /community，或 https:// 开头的网址">
            <Input value={f.link} onChange={(e) => setF({ ...f, link: e.target.value })} placeholder="/community" />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={f.level === "important"} onChange={(e) => setF({ ...f, level: e.target.checked ? "important" : "info" })} className="size-4 accent-lemon-500" />
            <Megaphone className="size-4 text-lemon-700" /> 重要通知（在用户首页顶部显示，直到用户点「知道了」）
          </label>
          <ErrorNote message={error} />
          {done && <p className="rounded-xl bg-mint-50 px-3.5 py-2.5 text-sm text-mint-700">✓ {done}</p>}
          <Button onClick={send} loading={busy} disabled={!f.title.trim() || reach === 0}>
            <Send className="size-4" /> 发送给 {reach} 人
          </Button>
        </Card>

        <div>
          <p className="mb-2 text-xs font-medium text-muted">用户看到的样子</p>
          <Card className={cx("space-y-2", f.level === "important" && "bg-gradient-to-br from-lemon-50 to-paper")}>
            <div className="flex items-center gap-1.5">
              {f.level === "important" ? (
                <Badge tone="lemon">
                  <Megaphone className="size-3" /> 重要
                </Badge>
              ) : (
                <Badge tone="sky">通知</Badge>
              )}
              <Badge tone="rose">新</Badge>
            </div>
            <h3 className="font-semibold">{f.title || "（标题）"}</h3>
            {f.body && <p className="whitespace-pre-wrap text-sm leading-relaxed">{f.body}</p>}
            {f.link && <span className="text-sm font-medium text-sakura-600">查看详情 →</span>}
          </Card>
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="font-semibold">已发送</h2>
        {sent.length === 0 ? (
          <EmptyState title="还没有发过通知" />
        ) : (
          sent.map((s) => (
            <div key={s.id} className={cx("flex flex-wrap items-start gap-3 rounded-2xl border border-line bg-paper px-4 py-3 shadow-[var(--shadow-soft)]", s.withdrawn && "opacity-60")}>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  {s.level === "important" && <Badge tone="lemon">重要</Badge>}
                  {s.withdrawn && <Badge tone="stone">已撤回</Badge>}
                  <span className="font-medium">{s.title}</span>
                </div>
                <div className="mt-0.5 text-xs text-muted">
                  {new Date(s.created_at).toLocaleString("zh-CN")} · {s.audience === "all" ? "所有用户" : `用户 ${s.user_ids.join("、")}`} · 已读 {s.reads} / {s.reach}
                </div>
                {s.body && <p className="mt-1 line-clamp-2 text-sm text-muted">{s.body}</p>}
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => act(s.id, s.withdrawn ? "restore" : "withdraw")}>
                  <Undo2 className="size-3.5" /> {s.withdrawn ? "恢复" : "撤回"}
                </Button>
                <button onClick={() => act(s.id, "delete")} className="rounded-lg p-1.5 text-muted hover:bg-sakura-50 hover:text-sakura-700" aria-label="删除">
                  <Trash2 className="size-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
