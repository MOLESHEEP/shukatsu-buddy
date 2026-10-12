"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { EyeOff, Heart, PenLine, Trash2 } from "lucide-react";
import { Button, Card, cx } from "@/components/ui";
import { api } from "@/lib/client";

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

export function OwnerActions({ id, status }: { id: number; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function unpublish() {
    if (!confirm("撤回后其他用户将看不到这篇分享，可以修改后重新发布。")) return;
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
          <PenLine className="size-4" /> {status === "draft" ? "继续编辑并发布" : "编辑"}
        </Link>
        {status === "published" && (
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
