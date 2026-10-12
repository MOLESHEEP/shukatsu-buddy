"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, EmptyState, cx, type Tone } from "@/components/ui";
import { COMPANY_STATUS, DEFAULT_STAGES } from "@/lib/constants";
import { api } from "@/lib/client";
import { formatDateTime, daysUntil } from "@/lib/time";
import type { Company } from "@/lib/data";

const CLOSED = "__closed";
const columnTone = ["sky", "sky", "violet", "lemon", "sakura", "sakura", "sakura", "mint"] as const;

function columnOf(c: Company) {
  if (c.status === "rejected" || c.status === "withdrawn") return CLOSED;
  if (c.status === "offer") return "内定";
  return (DEFAULT_STAGES as readonly string[]).includes(c.current_stage) ? c.current_stage : DEFAULT_STAGES[0];
}

export function Kanban({ companies: initial }: { companies: Company[] }) {
  const router = useRouter();
  const [companies, setCompanies] = useState(initial);
  const [dragId, setDragId] = useState<number | null>(null);
  const [over, setOver] = useState<string | null>(null);

  if (!initial.length) {
    return <EmptyState title="还没有公司">点击右上角「添加公司」，或在「邮件助手」里粘贴企业来信，自动建立公司卡片。</EmptyState>;
  }

  async function move(id: number, column: string) {
    const patch = column === CLOSED ? { status: "rejected" } : { current_stage: column, status: column === "内定" ? "offer" : "active" };
    setCompanies((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    await api(`/api/companies/${id}`, { method: "PATCH", body: patch });
    router.refresh();
  }

  const columns = [...DEFAULT_STAGES.map((s, i) => ({ key: s as string, label: s as string, tone: columnTone[i] as Tone })), { key: CLOSED, label: "已结束", tone: "stone" as Tone }];

  return (
    <div className="scrollbar-thin -mx-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6">
      <div className="flex gap-3">
        {columns.map((col) => {
          const cards = companies.filter((c) => columnOf(c) === col.key);
          return (
            <div
              key={col.key}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(col.key);
              }}
              onDragLeave={() => setOver(null)}
              onDrop={() => {
                if (dragId != null) move(dragId, col.key);
                setDragId(null);
                setOver(null);
              }}
              className={cx("w-64 shrink-0 rounded-[var(--radius-card)] bg-paper/60 p-2.5 transition", over === col.key && "bg-sakura-50 ring-2 ring-sakura-100")}
            >
              <div className="flex items-center justify-between px-1.5 pb-2.5 pt-1">
                <Badge tone={col.tone}>{col.label}</Badge>
                <span className="text-xs tabular-nums text-muted">{cards.length}</span>
              </div>
              <div className="min-h-16 space-y-2">
                {cards.map((c) => (
                  <CompanyCard key={c.id} c={c} onDragStart={() => setDragId(c.id)} onMove={(col) => move(c.id, col)} columns={columns} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CompanyCard({
  c,
  onDragStart,
  onMove,
  columns,
}: {
  c: Company;
  onDragStart: () => void;
  onMove: (col: string) => void;
  columns: { key: string; label: string }[];
}) {
  const days = c.next_deadline ? daysUntil(c.next_deadline) : null;
  const status = COMPANY_STATUS[c.status];
  return (
    <div draggable onDragStart={onDragStart} className="group cursor-grab rounded-2xl border border-line bg-paper p-3 shadow-[var(--shadow-soft)] transition hover:-translate-y-0.5 active:cursor-grabbing">
      <Link href={`/tracker/${c.id}`} className="block">
        <div className="flex items-start justify-between gap-2">
          <span className="font-medium leading-snug">{c.name}</span>
          {c.status !== "active" && <Badge tone={status?.tone}>{status?.label}</Badge>}
        </div>
        {c.industry && <div className="mt-0.5 text-xs text-muted">{c.industry}</div>}
        {c.next_action && (
          <div className="mt-2 text-xs">
            <span className="text-muted">下一步：</span>
            {c.next_action}
          </div>
        )}
        {c.next_deadline && (
          <div className={cx("mt-1 text-xs", days != null && days <= 3 && days >= 0 ? "font-medium text-sakura-600" : "text-muted")}>
            ⏰ {formatDateTime(c.next_deadline)}
            {days != null && days >= 0 && days <= 3 ? `（${days === 0 ? "今天" : days + " 天后"}）` : ""}
          </div>
        )}
      </Link>
      {/* Touch devices can't drag: a compact stage picker works everywhere. */}
      <select
        aria-label="移动到阶段"
        value=""
        onChange={(e) => e.target.value && onMove(e.target.value)}
        className="mt-2 w-full rounded-lg bg-stone-50 px-2 py-1 text-xs text-muted md:opacity-0 md:transition md:group-hover:opacity-100"
      >
        <option value="">移动到…</option>
        {columns.map((col) => (
          <option key={col.key} value={col.key}>
            {col.label}
          </option>
        ))}
      </select>
    </div>
  );
}
