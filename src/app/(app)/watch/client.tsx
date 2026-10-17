"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CalendarPlus, Check, ChevronDown, ExternalLink, EyeOff, Megaphone, PenLine, Plus, RefreshCw, RotateCcw, Trash2, Undo2, X } from "lucide-react";
import { Badge, Button, Card, ErrorNote, Field, Input, Select, Textarea, cx } from "@/components/ui";
import { api, errMsg } from "@/lib/client";
import { formatOpeningDate, toDateInput } from "@/lib/openings-shared";
import { DateTime } from "../openings/new/report-form";
import { INTERVALS, ITEM_KINDS, PERSONAL_LIMITS, WATCH_PHASES, roundText, type Detection, type OfficialSchedule, type WatchPage } from "@/lib/watch-shared";

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("zh-CN", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");

/** "2026-11-01T23:59" → "2026-11-01" when the time is a whole-day value. */
const wholeDay = (local: string) => (/T(00:00|23:59)$/.test(local) ? local.slice(0, 10) : local);

function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run<T>(fn: () => Promise<T>, refresh = true): Promise<T | null> {
    setBusy(true);
    setError(null);
    try {
      const out = await fn();
      if (refresh) router.refresh();
      return out;
    } catch (e) {
      setError(errMsg(e));
      return null;
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, setError, run };
}

// ---------- pages ----------

type PageForm = { company_name: string; url: string; grad_year: string; interval_hours: number; active: boolean };

function PageFields({ f, set, isAdmin }: { f: PageForm; set: (p: Partial<PageForm>) => void; isAdmin: boolean }) {
  return (
    <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
      <Field label="公司">
        <Input required maxLength={100} value={f.company_name} onChange={(e) => set({ company_name: e.target.value })} placeholder="株式会社〇〇" />
      </Field>
      <Field label="页面网址" hint="新卒采用页 / 募集要项 / 选考日程页">
        <Input required type="url" maxLength={500} value={f.url} onChange={(e) => set({ url: e.target.value })} placeholder="https://" />
      </Field>
      <Field label="届" hint="可不填">
        <Input type="number" min={2000} max={2100} value={f.grad_year} onChange={(e) => set({ grad_year: e.target.value })} placeholder="2028" />
      </Field>
      <Field label="检查频率">
        <Select value={f.interval_hours} onChange={(e) => set({ interval_hours: Number(e.target.value) })}>
          {INTERVALS.filter((h) => isAdmin || h >= PERSONAL_LIMITS.minInterval).map((h) => (
            <option key={h} value={h}>
              每 {h} 小时
            </option>
          ))}
        </Select>
      </Field>
    </div>
  );
}

const pageBody = (f: PageForm) => ({ ...f, grad_year: f.grad_year ? Number(f.grad_year) : null });

export function AddPage({ isAdmin }: { isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const empty: PageForm = { company_name: "", url: "", grad_year: "", interval_hours: 24, active: true };
  const [f, setF] = useState(empty);
  const { busy, error, run } = useAction();
  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-4" /> 添加监控页面
      </Button>
    );
  }
  return (
    <Card>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const ok = await run(() => api("/api/watch/pages", { body: pageBody(f) }));
          if (ok) {
            setF(empty);
            setOpen(false);
          }
        }}
      >
        <PageFields f={f} set={(p) => setF((s) => ({ ...s, ...p }))} isAdmin={isAdmin} />
        <p className="text-xs text-muted">
          添加后几分钟内会做第一次检查。页面文字有变化时才会调用 AI 识别。会遵守网站的 robots.txt；靠 JS 才能显示内容的页面可能抓不到，可以改用「粘贴识别」。
        </p>
        <ErrorNote message={error} />
        <div className="flex justify-end gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
            取消
          </Button>
          <Button type="submit" size="sm" loading={busy}>
            添加
          </Button>
        </div>
      </form>
    </Card>
  );
}

const STATUS: Record<string, { label: string; tone: string }> = {
  "": { label: "等待首次检查", tone: "stone" },
  unchanged: { label: "无变化", tone: "stone" },
  changed: { label: "有变化", tone: "mint" },
  error: { label: "出错", tone: "rose" },
};

export function PageRow({ p, isAdmin }: { p: WatchPage; isAdmin: boolean }) {
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState<PageForm>({ company_name: p.company_name, url: p.url, grad_year: p.grad_year ? String(p.grad_year) : "", interval_hours: p.interval_hours, active: p.active });
  const [msg, setMsg] = useState<string | null>(null);
  const { busy, error, run } = useAction();
  const st = STATUS[p.last_status] ?? STATUS[""];

  async function check(force: boolean) {
    setMsg(null);
    const r = await run(() => api<{ status: string; error?: string; detectionId: number | null; thin?: boolean }>(`/api/watch/pages/${p.id}`, { body: { force } }));
    if (!r) return;
    setMsg(
      r.status === "changed"
        ? `已识别，结果在「识别结果」里${r.thin ? "（页面文字很少，结果可能不完整）" : ""}`
        : r.status === "unchanged"
          ? "页面没有变化，不需要重新识别"
          : `出错：${r.error}`,
    );
  }

  if (editing) {
    return (
      <Card className="space-y-3">
        <PageFields f={f} set={(x) => setF((s) => ({ ...s, ...x }))} isAdmin={isAdmin} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.active} onChange={(e) => setF((s) => ({ ...s, active: e.target.checked }))} className="accent-sakura-500" />
          自动检查
        </label>
        <ErrorNote message={error} />
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
            取消
          </Button>
          <Button size="sm" loading={busy} onClick={async () => (await run(() => api(`/api/watch/pages/${p.id}`, { method: "PATCH", body: pageBody(f) }))) && setEditing(false)}>
            保存
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="rounded-2xl border border-line bg-paper p-4 shadow-[var(--shadow-soft)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone={st.tone}>{st.label}</Badge>
            {!p.active && <Badge>已暂停</Badge>}
            {p.grad_year && <Badge tone="violet">{p.grad_year} 届</Badge>}
            <span className="font-medium">{p.company_name}</span>
          </div>
          <a href={p.url} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1 truncate text-sm text-sakura-600 hover:underline">
            <span className="truncate">{p.url}</span> <ExternalLink className="size-3 shrink-0" />
          </a>
          <p className="text-xs text-muted">
            每 {p.interval_hours} 小时 · 上次检查 {when(p.last_checked_at)} · {p.active ? `下次 ${when(p.next_check_at)}` : "不自动检查"}
            {isAdmin && ` · 添加人 ${p.owner_email}`}
          </p>
          {p.last_error && (
            <p className={cx("flex items-start gap-1 rounded-xl px-3 py-2 text-xs", p.last_status === "error" ? "bg-sakura-50 text-sakura-700" : "bg-lemon-50 text-lemon-700")}>
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {p.last_error}
            </p>
          )}
          {msg && <p className="text-xs text-muted">{msg}</p>}
          <ErrorNote message={error} />
        </div>
        <div className="flex shrink-0 flex-wrap gap-1">
          <Button size="sm" variant="soft" loading={busy} onClick={() => check(false)}>
            <RefreshCw className="size-3.5" /> 立即检查
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => check(true)} title="即使页面没有变化也重新用 AI 识别一次">
            重新识别
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)} aria-label="编辑">
            <PenLine className="size-4" />
          </Button>
          <Button
            size="sm"
            variant="danger"
            disabled={busy}
            aria-label="删除"
            onClick={() => confirm(`停止监控「${p.company_name}」并删除这个页面？已发布的官方日程不受影响。`) && run(() => api(`/api/watch/pages/${p.id}`, { method: "DELETE" }))}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------- paste ----------

export function PasteReader() {
  const router = useRouter();
  const [f, setF] = useState({ company_name: "", url: "", text: "" });
  const { busy, error, run } = useAction();
  return (
    <Card>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await run(() => api<{ detectionId: number }>("/api/watch/paste", { body: f }), false);
          if (r) router.push(`/watch?tab=detections#d-${r.detectionId}`);
        }}
      >
        <p className="text-sm text-muted">抓不到的页面（需要登录的マイページ、靠 JS 显示的页面、PDF 募集要项）可以把页面文字复制过来识别。</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="公司">
            <Input required maxLength={100} value={f.company_name} onChange={(e) => setF((s) => ({ ...s, company_name: e.target.value }))} />
          </Field>
          <Field label="来源网址" hint="可不填">
            <Input type="url" maxLength={500} value={f.url} onChange={(e) => setF((s) => ({ ...s, url: e.target.value }))} placeholder="https://" />
          </Field>
        </div>
        <Field label="页面内容" hint={`${f.text.length} / 30000`}>
          <Textarea required rows={12} maxLength={30000} value={f.text} onChange={(e) => setF((s) => ({ ...s, text: e.target.value }))} placeholder="把采用页 / 募集要项里和选考日程有关的文字粘贴到这里" />
        </Field>
        <ErrorNote message={error} />
        <div className="flex justify-end">
          <Button type="submit" loading={busy}>
            AI 识别
          </Button>
        </div>
      </form>
    </Card>
  );
}

// ---------- schedule editor ----------

type ItemForm = { kind: string; title: string; starts_at: string; location: string };
export type ScheduleForm = {
  company_name: string;
  grad_year: string;
  round_no: string;
  round_label: string;
  phase: "open" | "upcoming" | "closed";
  entry_url: string;
  note: string;
  items: ItemForm[];
};

export function fromDetection(d: Detection): ScheduleForm {
  const r = d.result;
  return {
    company_name: d.company_name || r.company_name || "",
    grad_year: r.grad_year ? String(r.grad_year) : "",
    round_no: r.round_no ? String(r.round_no) : "",
    round_label: r.round_label,
    phase: r.phase === "unknown" ? "open" : r.phase,
    entry_url: r.entry_url ?? d.source_url ?? "",
    note: "",
    items: r.items.map((i) => ({ kind: i.kind, title: i.title_zh, starts_at: wholeDay(i.start_local), location: i.location ?? "" })),
  };
}

function fromOfficial(s: OfficialSchedule): ScheduleForm {
  return {
    company_name: s.company_name,
    grad_year: s.grad_year ? String(s.grad_year) : "",
    round_no: s.round_no ? String(s.round_no) : "",
    round_label: s.round_label,
    phase: s.phase,
    entry_url: s.entry_url,
    note: s.note,
    items: s.items.map((i) => ({ kind: i.kind, title: i.title, starts_at: toDateInput(i.starts_at), location: i.location })),
  };
}

const toBody = (f: ScheduleForm) => ({
  ...f,
  grad_year: f.grad_year ? Number(f.grad_year) : null,
  round_no: f.round_no ? Number(f.round_no) : null,
  items: f.items.filter((i) => i.starts_at),
});

const EMPTY: ScheduleForm = { company_name: "", grad_year: "", round_no: "", round_label: "", phase: "open", entry_url: "", note: "", items: [] };

/**
 * mode publish: admin publishes an official schedule (from a detection, or by hand).
 * mode edit:    admin edits a published one.
 * mode track:   a user copies a reading into their own tracker.
 */
export function ScheduleEditor({
  mode,
  initial = EMPTY,
  detectionId,
  scheduleId,
  calendarScope = "all",
  onDone,
}: {
  mode: "publish" | "edit" | "track";
  initial?: ScheduleForm;
  detectionId?: number;
  scheduleId?: number;
  calendarScope?: "all" | "followers";
  onDone?: () => void;
}) {
  const router = useRouter();
  const [f, setF] = useState<ScheduleForm>(initial);
  const [scope, setScope] = useState<"all" | "followers">(calendarScope);
  const [notify, setNotify] = useState<"all" | "followers" | "none">(mode === "edit" ? "none" : "all");
  const [done, setDone] = useState<string | null>(null);
  const { busy, error, setError, run } = useAction();
  const set = (p: Partial<ScheduleForm>) => setF((s) => ({ ...s, ...p }));
  const setItem = (i: number, p: Partial<ItemForm>) => setF((s) => ({ ...s, items: s.items.map((it, j) => (j === i ? { ...it, ...p } : it)) }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const body = toBody(f);
    if (mode !== "edit" && !body.items.length) return setError("至少需要一项带日期的日程");
    if (mode === "track") {
      const r = await run(() => api<{ companyId: number }>(`/api/watch/detections/${detectionId}`, { body }));
      if (r) setDone(`已加入你的选考追踪`), router.push(`/tracker/${r.companyId}`);
      return;
    }
    const reach = notify === "all" ? "所有用户" : notify === "followers" ? "关注这家公司的用户" : "";
    if (reach && !confirm(`${mode === "edit" ? "保存修改并" : "发布并"}发送站内通知给${reach}？`)) return;
    const r =
      mode === "edit"
        ? await run(() => api<{ notified: number }>(`/api/admin/official/${scheduleId}`, { method: "PATCH", body: { schedule: body, options: { calendar_scope: scope, notify } } }))
        : await run(() => api<{ id: number; notified: number }>("/api/admin/official", { body: { schedule: body, options: { calendar_scope: scope, notify }, detection_id: detectionId ?? null } }));
    if (!r) return;
    setDone(`${mode === "edit" ? "已保存" : "已发布"}${r.notified ? `，已通知 ${r.notified} 人` : ""}`);
    if (mode === "publish" && !detectionId) setF(EMPTY);
    onDone?.();
  }

  return (
    <Card>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
          <Field label="公司">
            <Input required maxLength={100} value={f.company_name} onChange={(e) => set({ company_name: e.target.value })} />
          </Field>
          <Field label="届" hint="空 = 不限">
            <Input type="number" min={2000} max={2100} value={f.grad_year} onChange={(e) => set({ grad_year: e.target.value })} />
          </Field>
          <Field label="状态">
            <Select value={f.phase} onChange={(e) => set({ phase: e.target.value as ScheduleForm["phase"] })}>
              {(["open", "upcoming", "closed"] as const).map((k) => (
                <option key={k} value={k}>
                  {WATCH_PHASES[k].label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="第几次选考" hint="数字，可不填">
            <Input type="number" min={1} max={20} value={f.round_no} onChange={(e) => set({ round_no: e.target.value })} placeholder="2" />
          </Field>
          <Field label="叫法" hint="如 第2回締切 / 二次募集" className="sm:col-span-2">
            <Input maxLength={60} value={f.round_label} onChange={(e) => set({ round_label: e.target.value })} />
          </Field>
        </div>
        <Field label="エントリー链接">
          <Input type="url" maxLength={500} value={f.entry_url} onChange={(e) => set({ entry_url: e.target.value })} placeholder="https://" />
        </Field>

        <div className="space-y-2">
          <p className="text-sm font-medium">日程</p>
          {f.items.map((it, i) => (
            <div key={i} className="grid gap-2 rounded-xl bg-cream/60 p-2 sm:grid-cols-[8rem_1fr_15rem_auto]">
              <Select value={it.kind} onChange={(e) => setItem(i, { kind: e.target.value })} aria-label="类型">
                {Object.entries(ITEM_KINDS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </Select>
              <Input value={it.title} maxLength={120} onChange={(e) => setItem(i, { title: e.target.value })} placeholder="如 ES 提交截止" aria-label="标题" />
              <DateTime value={it.starts_at} onChange={(v) => setItem(i, { starts_at: v })} />
              <Button type="button" size="sm" variant="ghost" aria-label="删除这一项" onClick={() => setF((s) => ({ ...s, items: s.items.filter((_, j) => j !== i) }))}>
                <X className="size-4" />
              </Button>
              <Input className="sm:col-span-3" value={it.location} maxLength={500} onChange={(e) => setItem(i, { location: e.target.value })} placeholder="地点 / 链接（可不填）" aria-label="地点" />
            </div>
          ))}
          <Button type="button" size="sm" variant="soft" onClick={() => setF((s) => ({ ...s, items: [...s.items, { kind: "deadline", title: "", starts_at: "", location: "" }] }))}>
            <Plus className="size-3.5" /> 添加一项
          </Button>
        </div>

        {mode !== "track" && (
          <>
            <Field label="补充说明" hint="会显示在详情页">
              <Textarea rows={2} maxLength={1000} value={f.note} onChange={(e) => set({ note: e.target.value })} />
            </Field>
            <div className="grid gap-3 rounded-2xl bg-violet-50/50 p-3 sm:grid-cols-2">
              <div className="space-y-1.5 text-sm">
                <p className="font-medium">显示在谁的日历上</p>
                {(
                  [
                    ["all", "所有用户"],
                    ["followers", "只有关注这家公司的用户"],
                  ] as const
                ).map(([v, label]) => (
                  <label key={v} className="flex items-center gap-2">
                    <input type="radio" name="scope" checked={scope === v} onChange={() => setScope(v)} className="accent-violet-500" /> {label}
                  </label>
                ))}
                <p className="text-xs text-muted">只显示给届数一致（或没填届数）的用户；用户可以在日历页关闭官方日程。</p>
              </div>
              <div className="space-y-1.5 text-sm">
                <p className="font-medium">现在发送站内通知</p>
                {(
                  [
                    ["all", "所有用户"],
                    ["followers", "关注这家公司的用户"],
                    ["none", "不发送"],
                  ] as const
                ).map(([v, label]) => (
                  <label key={v} className="flex items-center gap-2">
                    <input type="radio" name="notify" checked={notify === v} onChange={() => setNotify(v)} className="accent-violet-500" /> {label}
                  </label>
                ))}
              </div>
            </div>
          </>
        )}

        <ErrorNote message={error} />
        <div className="flex items-center justify-end gap-3">
          {done && <span className="text-sm text-mint-700">{done}</span>}
          {onDone && (
            <Button type="button" size="sm" variant="ghost" onClick={onDone}>
              取消
            </Button>
          )}
          <Button type="submit" loading={busy}>
            {mode === "track" ? (
              <>
                <CalendarPlus className="size-4" /> 加入我的选考追踪
              </>
            ) : mode === "edit" ? (
              "保存修改"
            ) : (
              <>
                <Megaphone className="size-4" /> 发布官方日程
              </>
            )}
          </Button>
        </div>
      </form>
    </Card>
  );
}

// ---------- detections ----------

const D_STATUS: Record<string, { label: string; tone: string }> = {
  new: { label: "待确认", tone: "lemon" },
  dismissed: { label: "已忽略", tone: "stone" },
  published: { label: "已发布", tone: "mint" },
  tracked: { label: "已加入追踪", tone: "mint" },
};
const SOURCE: Record<string, string> = { auto: "自动检查", manual: "手动检查", paste: "粘贴识别" };

export function DetectionCard({ d, isAdmin }: { d: Detection; isAdmin: boolean }) {
  const r = d.result;
  const [open, setOpen] = useState(d.status === "new");
  const [editing, setEditing] = useState(false);
  const { busy, error, run } = useAction();
  const phase = WATCH_PHASES[r.phase] ?? WATCH_PHASES.unknown;
  const round = roundText(r);
  const st = D_STATUS[d.status];

  return (
    <div id={`d-${d.id}`} className="scroll-mt-24 rounded-2xl border border-line bg-paper p-4 shadow-[var(--shadow-soft)]">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone={st.tone}>{st.label}</Badge>
        <Badge tone={phase.tone}>{r.is_selection_page ? phase.label : "不是本选考信息"}</Badge>
        {round && <Badge tone="violet">{round}</Badge>}
        {r.grad_year && <Badge>{r.grad_year} 届</Badge>}
        <Badge tone={r.confidence >= 0.7 ? "mint" : r.confidence >= 0.4 ? "lemon" : "rose"}>可信度 {Math.round(r.confidence * 100)}%</Badge>
        <span className="ml-auto text-xs text-muted">
          {SOURCE[d.source]} · {when(d.created_at)}
        </span>
      </div>
      <button onClick={() => setOpen((o) => !o)} className="mt-1.5 flex items-center gap-1 text-left font-medium hover:text-sakura-600">
        {d.company_name || "未知公司"}
        <ChevronDown className={cx("size-4 shrink-0 transition", open && "rotate-180")} />
      </button>
      <p className="text-sm text-muted">{r.summary_zh}</p>

      {open && !editing && (
        <div className="mt-3 space-y-3 border-t border-line pt-3 text-sm">
          {r.items.length > 0 ? (
            <ul className="space-y-1">
              {r.items.map((i, k) => (
                <li key={k} className="flex flex-wrap items-center gap-2">
                  <Badge tone={ITEM_KINDS[i.kind]?.tone}>{ITEM_KINDS[i.kind]?.label ?? i.kind}</Badge>
                  <span className="tabular-nums">{i.start_local.replace("T", " ")}</span>
                  <span>{i.title_zh}</span>
                  {i.location && <span className="text-xs text-muted">{i.location}</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted">没有识别到具体日期。</p>
          )}
          {r.entry_url && (
            <a href={r.entry_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sakura-600 hover:underline">
              エントリー链接 <ExternalLink className="size-3" />
            </a>
          )}
          {d.source_url && (
            <p className="truncate text-xs text-muted">
              来源：
              <a href={d.source_url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                {d.source_url}
              </a>
            </p>
          )}
          {r.evidence_ja.length > 0 && (
            <div className="rounded-xl bg-cream/60 p-3 text-xs">
              <p className="mb-1 font-medium">页面原文依据</p>
              {r.evidence_ja.map((e, k) => (
                <p key={k} className="text-muted">「{e}」</p>
              ))}
            </div>
          )}
          {r.uncertain_points_zh.length > 0 && (
            <div className="rounded-xl bg-lemon-50 p-3 text-xs text-lemon-700">
              <p className="mb-1 font-medium">需要核对</p>
              {r.uncertain_points_zh.map((e, k) => (
                <p key={k}>· {e}</p>
              ))}
            </div>
          )}
          <ErrorNote message={error} />
          <div className="flex flex-wrap justify-end gap-2">
            {d.status === "new" && (
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => api(`/api/watch/detections/${d.id}`, { method: "PATCH", body: { status: "dismissed" } }))}>
                <EyeOff className="size-3.5" /> 忽略
              </Button>
            )}
            {d.status === "dismissed" && (
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => api(`/api/watch/detections/${d.id}`, { method: "PATCH", body: { status: "new" } }))}>
                <Undo2 className="size-3.5" /> 恢复
              </Button>
            )}
            {d.status === "published" && d.schedule_id && (
              <Link href={`/official/${d.schedule_id}`} className="inline-flex items-center gap-1 text-sm text-sakura-600 hover:underline">
                查看官方日程
              </Link>
            )}
            {(d.status === "new" || d.status === "dismissed") && (
              <Button size="sm" onClick={() => setEditing(true)}>
                {isAdmin ? (
                  <>
                    <Check className="size-3.5" /> 确认并发布
                  </>
                ) : (
                  <>
                    <CalendarPlus className="size-3.5" /> 确认并加入我的追踪
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      )}
      {editing && (
        <div className="mt-3">
          <p className="mb-2 text-xs text-muted">下面是 AI 识别的结果，请对照原页面核对、修改后再{isAdmin ? "发布" : "加入"}。</p>
          <ScheduleEditor mode={isAdmin ? "publish" : "track"} initial={fromDetection(d)} detectionId={d.id} onDone={() => setEditing(false)} />
        </div>
      )}
    </div>
  );
}

// ---------- published ----------

export function PublishedSchedule({ s }: { s: OfficialSchedule }) {
  const [editing, setEditing] = useState(false);
  const { busy, error, run } = useAction();
  const round = roundText(s);
  const phase = WATCH_PHASES[s.phase];
  if (editing) return <ScheduleEditor mode="edit" initial={fromOfficial(s)} scheduleId={s.id} calendarScope={s.calendar_scope} onDone={() => setEditing(false)} />;
  return (
    <div className={cx("rounded-2xl border border-line bg-paper p-4 shadow-[var(--shadow-soft)]", s.withdrawn && "opacity-60")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {s.withdrawn ? <Badge tone="rose">已撤回</Badge> : <Badge tone={phase.tone}>{phase.label}</Badge>}
            {round && <Badge tone="violet">{round}</Badge>}
            {s.grad_year ? <Badge>{s.grad_year} 届</Badge> : <Badge>不限届</Badge>}
            <Badge tone="sky">{s.calendar_scope === "all" ? "所有用户日历" : "关注者日历"}</Badge>
            <Link href={`/official/${s.id}`} className="font-medium hover:text-sakura-600">
              {s.company_name}
            </Link>
          </div>
          <p className="text-xs text-muted">
            {s.items.length} 项日程
            {s.items[0] && ` · ${formatOpeningDate(s.items[0].starts_at)} 起`} · 发布于 {when(s.published_at)} · 已通知 {s.notified} 人
          </p>
          <ErrorNote message={error} />
        </div>
        <div className="flex shrink-0 gap-1">
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)} aria-label="编辑">
            <PenLine className="size-4" />
          </Button>
          {s.withdrawn ? (
            <Button size="sm" variant="soft" disabled={busy} onClick={() => run(() => api(`/api/admin/official/${s.id}`, { method: "PATCH", body: { withdrawn: false } }))}>
              <RotateCcw className="size-3.5" /> 恢复
            </Button>
          ) : (
            <Button
              size="sm"
              variant="danger"
              disabled={busy}
              onClick={() =>
                confirm(`撤回「${s.company_name}」的官方日程？会从所有用户的日历上消失（已加入自己追踪的用户不受影响）。`) &&
                run(() => api(`/api/admin/official/${s.id}`, { method: "PATCH", body: { withdrawn: true } }))
              }
            >
              撤回
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
