"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Badge, Button, EmptyState, Select, Textarea, cx } from "@/components/ui";
import { FEEDBACK_CATEGORIES, FEEDBACK_STATUS, type FeedbackRow } from "@/lib/feedback";
import { api, errMsg } from "@/lib/client";

export function AdminFeedbackList({ items }: { items: FeedbackRow[] }) {
  if (!items.length) return <EmptyState title="这里没有反馈">用户在侧边栏「意见反馈」提交的建议会出现在这里。</EmptyState>;
  return (
    <div className="space-y-3">
      {items.map((f) => (
        <Item key={f.id} f={f} />
      ))}
    </div>
  );
}

function Item({ f }: { f: FeedbackRow }) {
  const router = useRouter();
  const [reply, setReply] = useState(f.reply);
  const [status, setStatus] = useState(f.status);
  // Keep the select in sync after router.refresh() brings a new server status.
  const [seenStatus, setSeenStatus] = useState(f.status);
  if (seenStatus !== f.status) {
    setSeenStatus(f.status);
    setStatus(f.status);
  }
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const cat = FEEDBACK_CATEGORIES[f.category] ?? FEEDBACK_CATEGORIES.other;
  const st = FEEDBACK_STATUS[f.status] ?? FEEDBACK_STATUS.new;
  const dirty = reply !== f.reply || status !== f.status;

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      // Send status only if the admin changed it, so a reply can auto-advance 待处理 -> 处理中.
      await api(`/api/admin/feedback/${f.id}`, { method: "PATCH", body: { reply, ...(status !== f.status ? { status } : {}) } });
      setMsg({ ok: true, text: reply !== f.reply && reply ? "已回复，用户会看到红点提醒" : "已保存" });
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: errMsg(e) });
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!confirm("删除这条反馈？")) return;
    await api(`/api/admin/feedback/${f.id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className={cx("rounded-2xl border bg-paper p-4 shadow-[var(--shadow-soft)]", f.status === "new" ? "border-sakura-100" : "border-line")}>
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
        <Badge tone="stone">
          {cat.emoji} {cat.label}
        </Badge>
        <Badge tone={st.tone}>{st.label}</Badge>
        <span>
          {f.user_name || "（未填名字）"} · {f.user_email ?? "已注销用户"}
          {f.user_id && (
            <Link href={`/admin/users?q=${f.user_id}`} className="ml-1 font-mono text-sky-700 hover:underline">
              ID {f.user_id}
            </Link>
          )}
        </span>
        <span>· {new Date(f.created_at).toLocaleString("zh-CN")}</span>
        {f.page && (
          <Link href={f.page} target="_blank" className="font-mono text-sky-700 hover:underline">
            · {f.page}
          </Link>
        )}
        <button onClick={remove} className="ml-auto rounded-lg p-1 hover:bg-sakura-50 hover:text-sakura-700" aria-label="删除">
          <Trash2 className="size-3.5" />
        </button>
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{f.content}</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
        <Textarea rows={2} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="回复用户（可选，用户会在「意见反馈」里看到）" maxLength={3000} />
        <div className="flex gap-2 sm:flex-col">
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-auto py-1.5 text-sm">
            {Object.entries(FEEDBACK_STATUS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </Select>
          <Button size="sm" onClick={save} loading={busy} disabled={!dirty}>
            {reply !== f.reply && reply ? "回复" : "保存"}
          </Button>
        </div>
      </div>
      {msg && <p className={cx("mt-2 text-xs", msg.ok ? "text-mint-700" : "text-sakura-700")}>{msg.text}</p>}
    </div>
  );
}
