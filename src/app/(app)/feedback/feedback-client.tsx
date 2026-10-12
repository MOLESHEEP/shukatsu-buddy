"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { Badge, Button, Card, EmptyState, ErrorNote, Textarea, cx } from "@/components/ui";
import { FEEDBACK_CATEGORIES, FEEDBACK_STATUS, type FeedbackRow } from "@/lib/feedback";
import { api, errMsg } from "@/lib/client";

export function FeedbackForm({ from }: { from: string }) {
  const router = useRouter();
  const [category, setCategory] = useState("idea");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api("/api/feedback", { body: { category, content, page: from } });
      setContent("");
      setSent(true);
      router.refresh();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {Object.entries(FEEDBACK_CATEGORIES).map(([k, v]) => (
          <button
            key={k}
            type="button"
            onClick={() => setCategory(k)}
            className={cx(
              "rounded-2xl border px-3 py-2.5 text-sm transition",
              category === k ? "border-sakura-300 bg-sakura-50 font-medium text-sakura-700" : "border-line text-muted hover:bg-stone-50",
            )}
          >
            {v.emoji} {v.label}
          </button>
        ))}
      </div>
      <Textarea
        rows={6}
        value={content}
        maxLength={3000}
        onChange={(e) => {
          setContent(e.target.value);
          setSent(false);
        }}
        placeholder={
          category === "bug"
            ? "遇到了什么问题？在哪个页面、做了什么操作、看到了什么提示？越具体越好。"
            : category === "idea"
              ? "希望增加什么功能，或者哪里用起来不顺手？说说你的使用场景。"
              : "请写下你的意见或建议。"
        }
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-muted">
          {from ? `会附上你刚才所在的页面（${from}），方便定位问题。` : ""} {content.length} / 3000
        </span>
        <Button onClick={submit} loading={busy} disabled={content.trim().length < 5}>
          <Send className="size-4" /> 提交
        </Button>
      </div>
      <ErrorNote message={error} />
      {sent && <p className="rounded-xl bg-mint-50 px-3.5 py-2.5 text-sm text-mint-700">✓ 已收到，谢谢你的反馈！管理员回复后会在侧边栏「意见反馈」显示红点。</p>}
    </Card>
  );
}

export function FeedbackList({ items }: { items: FeedbackRow[] }) {
  if (!items.length) return <EmptyState title="还没有提交过反馈" />;
  return (
    <div className="space-y-3">
      <h2 className="font-semibold">我的反馈</h2>
      {items.map((f) => {
        const cat = FEEDBACK_CATEGORIES[f.category] ?? FEEDBACK_CATEGORIES.other;
        const st = FEEDBACK_STATUS[f.status] ?? FEEDBACK_STATUS.new;
        const fresh = f.reply && !f.reply_seen;
        return (
          <Card key={f.id} className={cx("space-y-2.5", fresh && "border-sakura-300")}>
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
              <Badge tone="stone">
                {cat.emoji} {cat.label}
              </Badge>
              <Badge tone={st.tone}>{st.label}</Badge>
              <span>{new Date(f.created_at).toLocaleString("zh-CN")}</span>
              {fresh && <Badge tone="rose">新回复</Badge>}
            </div>
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{f.content}</p>
            {f.reply && (
              <div className="rounded-2xl bg-violet-50 px-4 py-3 text-sm text-violet-700">
                <p className="text-xs font-medium">
                  管理员回复 {f.replied_at && <span className="font-normal opacity-70">· {new Date(f.replied_at).toLocaleString("zh-CN")}</span>}
                </p>
                <p className="mt-1 whitespace-pre-wrap leading-relaxed">{f.reply}</p>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
