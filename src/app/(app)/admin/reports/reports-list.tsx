"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, EyeOff, Trash2 } from "lucide-react";
import { Badge, Button, EmptyState } from "@/components/ui";
import { api, errMsg } from "@/lib/client";
import { REPORT_REASONS } from "@/lib/community";
import type { AdminReportRow } from "@/lib/admin";

const STATUS: Record<string, { label: string; tone: string }> = {
  open: { label: "待处理", tone: "rose" },
  resolved: { label: "已处理", tone: "mint" },
  dismissed: { label: "已驳回", tone: "stone" },
};

export function ReportsList({ reports }: { reports: AdminReportRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!reports.length) return <EmptyState title="没有举报">用户举报的经验分享会出现在这里。</EmptyState>;

  async function act(id: number, action: "dismiss" | "hide" | "delete") {
    if (action === "delete" && !confirm("永久删除这篇分享？")) return;
    setBusy(id);
    setError(null);
    try {
      await api(`/api/admin/reports/${id}`, { method: "PATCH", body: { action } });
      router.refresh();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-2">
      {error && <p className="rounded-xl bg-sakura-50 px-3 py-2 text-sm text-sakura-700">{error}</p>}
      {reports.map((r) => (
        <div key={r.id} className="rounded-2xl border border-line bg-paper p-4 shadow-[var(--shadow-soft)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge tone={STATUS[r.status]?.tone}>{STATUS[r.status]?.label}</Badge>
                <Badge tone="lemon">{REPORT_REASONS[r.reason] ?? r.reason}</Badge>
                {r.open_reports > 1 && <Badge tone="rose">共 {r.open_reports} 人举报</Badge>}
                {r.post_status === "hidden" && <Badge tone="stone">帖子已隐藏</Badge>}
              </div>
              <Link href={`/community/${r.post_id}`} target="_blank" className="mt-1.5 block font-medium hover:text-sakura-600">
                {r.post_title}
              </Link>
              <p className="text-xs text-muted">
                {r.post_company} · 作者 {r.author_email}（ID {r.author_id}）
              </p>
              {r.detail && <p className="mt-2 rounded-xl bg-stone-50 px-3 py-2 text-sm">“{r.detail}”</p>}
              <p className="mt-1.5 text-xs text-muted">
                举报人 {r.reporter_email ?? "已注销"} · {new Date(r.created_at).toLocaleString("zh-CN")}
              </p>
            </div>
            {r.status === "open" && (
              <div className="flex flex-wrap gap-1.5">
                <Button size="sm" variant="ghost" disabled={busy === r.id} onClick={() => act(r.id, "dismiss")}>
                  <Check className="size-3.5" /> 没问题，驳回
                </Button>
                <Button size="sm" variant="soft" disabled={busy === r.id} onClick={() => act(r.id, "hide")}>
                  <EyeOff className="size-3.5" /> 隐藏帖子
                </Button>
                <Button size="sm" variant="danger" disabled={busy === r.id} onClick={() => act(r.id, "delete")}>
                  <Trash2 className="size-3.5" /> 删除帖子
                </Button>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
