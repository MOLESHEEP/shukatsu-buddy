"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Eye, EyeOff, Flag, Heart, PenLine, ShieldCheck, Trash2, X } from "lucide-react";
import { Button, Card, Textarea, cx } from "@/components/ui";
import { api, errMsg } from "@/lib/client";
import { REPORT_REASONS } from "@/lib/community";

export function VoteButton({ id, votes, voted, disabled }: { id: number; votes: number; voted: boolean; disabled?: boolean }) {
  const [state, setState] = useState({ votes, voted });
  const [busy, setBusy] = useState(false);
  async function toggle() {
    setBusy(true);
    try {
      setState(await api<{ votes: number; voted: boolean }>(`/api/posts/${id}/vote`, { method: "POST" }));
    } finally {
      setBusy(false);
    }
  }
  return (
    <button
      onClick={toggle}
      disabled={busy || disabled}
      title={disabled ? "不能给自己点赞" : undefined}
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition active:scale-95 disabled:cursor-default",
        state.voted ? "bg-sakura-500 text-white" : "bg-sakura-50 text-sakura-700 hover:bg-sakura-100",
      )}
    >
      <Heart className={cx("size-4", state.voted && "fill-white")} />
      有帮助 {state.votes > 0 && state.votes}
    </button>
  );
}

export function ReportButton({ id }: { id: number }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("privacy");
  const [detail, setDetail] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  async function submit() {
    setState("busy");
    setError(null);
    try {
      await api(`/api/posts/${id}/report`, { body: { reason, detail } });
      setState("done");
    } catch (e) {
      setError(errMsg(e));
      setState("idle");
    }
  }
  if (state === "done") return <span className="text-mint-700">已收到举报，管理员会尽快处理</span>;
  return (
    <>
      <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1 hover:text-sakura-600">
        <Flag className="size-3.5" /> 举报
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/20 backdrop-blur-sm sm:items-center sm:p-4" onClick={() => setOpen(false)}>
          <Card className="animate-rise w-full max-w-md space-y-3 rounded-b-none text-left text-sm sm:rounded-b-[var(--radius-card)]" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-semibold text-ink">举报这篇分享</h2>
            <div className="space-y-1.5">
              {Object.entries(REPORT_REASONS).map(([k, v]) => (
                <label key={k} className="flex items-center gap-2 text-ink">
                  <input type="radio" name="reason" checked={reason === k} onChange={() => setReason(k)} className="accent-sakura-500" />
                  {v}
                </label>
              ))}
            </div>
            <Textarea rows={3} value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="补充说明（可选）" maxLength={500} />
            {error && <p className="text-xs text-sakura-700">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
                取消
              </Button>
              <Button size="sm" onClick={submit} loading={state === "busy"}>
                提交举报
              </Button>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}

export function AdminPostActions({ id, status }: { id: number; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function setStatus(next: "published" | "hidden") {
    setBusy(true);
    await api(`/api/admin/posts/${id}`, { method: "PATCH", body: { status: next } });
    router.refresh();
    setBusy(false);
  }
  async function review(action: "approve" | "reject") {
    const note = action === "reject" ? prompt("驳回原因（会通知作者）", "不符合社区规则") : "";
    if (note === null) return;
    setBusy(true);
    try {
      await api(`/api/admin/review/${id}`, { method: "PATCH", body: { action, note } });
    } catch (e) {
      alert(errMsg(e));
    }
    router.refresh();
    setBusy(false);
  }
  async function remove() {
    if (!confirm("以管理员身份永久删除这篇分享？")) return;
    setBusy(true);
    await api(`/api/admin/posts/${id}`, { method: "DELETE" });
    router.push("/community");
    router.refresh();
  }
  return (
    <Card className="flex flex-wrap items-center justify-between gap-3 border-violet-100 bg-violet-50/50">
      <span className="flex items-center gap-1.5 text-sm text-violet-700">
        <ShieldCheck className="size-4" /> 管理员操作
      </span>
      <div className="flex flex-wrap gap-2">
        {(status === "pending" || status === "rejected") && (
          <Button size="sm" variant="soft" onClick={() => review("approve")} disabled={busy}>
            <Check className="size-4" /> 审核通过
          </Button>
        )}
        {status === "pending" && (
          <Button size="sm" variant="ghost" onClick={() => review("reject")} disabled={busy}>
            <X className="size-4" /> 驳回
          </Button>
        )}
        {status === "hidden" ? (
          <Button size="sm" variant="soft" onClick={() => setStatus("published")} disabled={busy}>
            <Eye className="size-4" /> 恢复显示
          </Button>
        ) : status === "published" ? (
          <Button size="sm" variant="ghost" onClick={() => setStatus("hidden")} disabled={busy}>
            <EyeOff className="size-4" /> 隐藏
          </Button>
        ) : null}
        <Button size="sm" variant="danger" onClick={remove} disabled={busy}>
          <Trash2 className="size-4" /> 删除
        </Button>
      </div>
    </Card>
  );
}

export function OwnerActions({ id, status }: { id: number; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function unpublish() {
    if (!confirm(status === "pending" ? "撤回审核申请？分享会回到草稿状态。" : "撤回后其他用户将看不到这篇分享，可以修改后重新发布（需要重新审核）。")) return;
    setBusy(true);
    await api(`/api/posts/${id}`, { method: "PATCH", body: { action: "unpublish" } });
    router.refresh();
    setBusy(false);
  }
  async function remove() {
    if (!confirm("永久删除这篇分享？")) return;
    setBusy(true);
    await api(`/api/posts/${id}`, { method: "DELETE" });
    router.push("/community?tab=mine");
    router.refresh();
  }
  return (
    <Card className="flex flex-wrap items-center justify-between gap-3">
      <span className="text-sm text-muted">这是你的分享</span>
      <div className="flex flex-wrap gap-2">
        <Link href={`/community/${id}/edit`} className="inline-flex items-center gap-1.5 rounded-full bg-sakura-50 px-4 py-1.5 text-sm font-medium text-sakura-700 hover:bg-sakura-100">
          <PenLine className="size-4" /> {status === "draft" ? "继续编辑并发布" : status === "rejected" ? "修改后重新提交" : "编辑"}
        </Link>
        {(status === "published" || status === "pending") && (
          <Button size="sm" variant="ghost" onClick={unpublish} disabled={busy}>
            <EyeOff className="size-4" /> 撤回
          </Button>
        )}
        <Button size="sm" variant="danger" onClick={remove} disabled={busy}>
          <Trash2 className="size-4" /> 删除
        </Button>
      </div>
    </Card>
  );
}
