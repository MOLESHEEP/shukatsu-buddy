"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, ExternalLink, PenLine, Trash2, X } from "lucide-react";
import { Badge, Button, Card, ErrorNote, Field, Input, Textarea, cx } from "@/components/ui";
import { api, errMsg } from "@/lib/client";
import { PHASES, formatOpeningDate, openingPhase, toDateInput, type Opening } from "@/lib/openings-shared";
import type { ReportRow } from "@/lib/openings";
import { DateTime } from "../../openings/new/report-form";

type Form = { company_name: string; grad_year: string; opens_at: string; deadline: string; url: string; note: string };

const toForm = (o?: Partial<Pick<Opening, "company_name" | "grad_year" | "opens_at" | "deadline" | "url" | "note">> | null): Form => ({
  company_name: o?.company_name ?? "",
  grad_year: o?.grad_year ? String(o.grad_year) : "",
  opens_at: toDateInput(o?.opens_at ?? null),
  deadline: toDateInput(o?.deadline ?? null),
  url: o?.url ?? "",
  note: o?.note ?? "",
});

const toBody = (f: Form) => ({ ...f, grad_year: f.grad_year ? Number(f.grad_year) : null });

function Fields({ f, set }: { f: Form; set: (k: keyof Form, v: string) => void }) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
        <Field label="公司">
          <Input required maxLength={100} value={f.company_name} onChange={(e) => set("company_name", e.target.value)} />
        </Field>
        <Field label="届" hint="空 = 不限">
          <Input type="number" min={2000} max={2100} value={f.grad_year} onChange={(e) => set("grad_year", e.target.value)} />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="エントリー开放">
          <DateTime value={f.opens_at} onChange={(v) => set("opens_at", v)} />
        </Field>
        <Field label="エントリー截止">
          <DateTime value={f.deadline} onChange={(v) => set("deadline", v)} />
        </Field>
      </div>
      <Field label="链接">
        <Input type="url" maxLength={500} value={f.url} onChange={(e) => set("url", e.target.value)} placeholder="https://" />
      </Field>
      <Field label="补充说明">
        <Textarea rows={2} maxLength={500} value={f.note} onChange={(e) => set("note", e.target.value)} />
      </Field>
    </div>
  );
}

function useForm(initial: Form) {
  const [f, setF] = useState(initial);
  return [f, (k: keyof Form, v: string) => setF((s) => ({ ...s, [k]: v })), setF] as const;
}

function NotifyToggle({ notify, setNotify }: { notify: boolean; setNotify: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="accent-sakura-500" />
      通知关注这家公司的用户（日期或链接有变化时）
    </label>
  );
}

/** Create a record (no `initial`) or edit one. Saving a company + 届 that already exists updates that record. */
export function OpeningEditor({ initial, onDone }: { initial?: Opening; onDone?: () => void }) {
  const router = useRouter();
  const [f, set, setF] = useForm(toForm(initial));
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const r = initial
        ? await api<{ notified: number }>(`/api/admin/openings/${initial.id}`, { method: "PATCH", body: { item: toBody(f), notify } })
        : await api<{ created: boolean; notified: number }>("/api/admin/openings", { body: { item: toBody(f), notify } });
      const what = initial ? "已保存" : "created" in r && !r.created ? "已有同一公司、同届的记录，已更新那一条" : "已发布";
      setMsg(`${what}${r.notified ? `，已通知 ${r.notified} 人` : ""}`);
      if (!initial) setF(toForm(null));
      router.refresh();
      onDone?.();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <form onSubmit={save} className="space-y-3">
        {!initial && <h2 className="font-semibold">录入一条</h2>}
        <Fields f={f} set={set} />
        <NotifyToggle notify={notify} setNotify={setNotify} />
        <ErrorNote message={error} />
        <div className="flex items-center justify-end gap-3">
          {msg && <span className="text-sm text-mint-700">{msg}</span>}
          {onDone && (
            <Button type="button" variant="ghost" size="sm" onClick={onDone}>
              取消
            </Button>
          )}
          <Button type="submit" size="sm" loading={busy}>
            {initial ? "保存" : "发布"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function Summary({ o }: { o: Pick<Opening, "opens_at" | "deadline" | "url" | "note" | "grad_year"> }) {
  return (
    <div className="space-y-0.5 text-sm">
      <p>
        <span className="text-muted">届：</span>
        {o.grad_year ?? "不限"}
        <span className="ml-3 text-muted">开放：</span>
        {formatOpeningDate(o.opens_at) || "—"}
        <span className="ml-3 text-muted">截止：</span>
        {formatOpeningDate(o.deadline) || "—"}
      </p>
      {o.url && (
        <a href={o.url} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1 truncate text-sakura-600 hover:underline">
          {o.url} <ExternalLink className="size-3 shrink-0" />
        </a>
      )}
      {o.note && <p className="whitespace-pre-wrap text-muted">{o.note}</p>}
    </div>
  );
}

export function PublishedOpening({ o }: { o: Opening }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const phase = PHASES[openingPhase(o)];

  async function remove() {
    if (!confirm(`删除「${o.company_name}」这条选考信息？用户已经加入自己选考追踪的内容不受影响。`)) return;
    setBusy(true);
    try {
      await api(`/api/admin/openings/${o.id}`, { method: "DELETE" });
      router.refresh();
    } catch (e) {
      alert(errMsg(e));
      setBusy(false);
    }
  }

  if (editing) return <OpeningEditor initial={o} onDone={() => setEditing(false)} />;
  return (
    <div className="rounded-2xl border border-line bg-paper p-4 shadow-[var(--shadow-soft)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone={phase.tone}>{phase.label}</Badge>
            <Badge tone={o.source === "admin" ? "violet" : "sky"}>{o.source === "admin" ? "管理员录入" : "用户上报"}</Badge>
            <span className="font-medium">{o.company_name}</span>
          </div>
          <Summary o={o} />
        </div>
        <div className="flex shrink-0 gap-1">
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)} aria-label="编辑">
            <PenLine className="size-4" />
          </Button>
          <Button size="sm" variant="danger" disabled={busy} onClick={remove} aria-label="删除">
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

const REWARD: Record<string, string> = { awarded: "+1 point", capped: "已达上限未计分" };

export function ReportReview({ r }: { r: ReportRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(r.status === "pending");
  const [f, set] = useForm(toForm(r));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(action: "approve" | "reject") {
    if (action === "reject" && !note.trim() && !confirm("没有填写驳回原因，上报人只会看到「信息无法确认」。继续？")) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/admin/openings/reports/${r.id}`, { method: "PATCH", body: action === "approve" ? { action, fields: toBody(f) } : { action, note } });
      router.refresh();
    } catch (e) {
      setError(errMsg(e));
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-line bg-paper p-4 shadow-[var(--shadow-soft)]">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone={r.existing ? "lemon" : "mint"}>{r.existing ? "更新已有记录" : "新公司"}</Badge>
        {r.opening_id && <Badge tone="sky">纠错 / 补充</Badge>}
        <Badge>{r.anonymous ? "匿名" : "显示昵称"}</Badge>
        {REWARD[r.reward] && <Badge tone="mint">{REWARD[r.reward]}</Badge>}
      </div>
      <button onClick={() => setOpen((o) => !o)} className="mt-1.5 flex items-center gap-1 text-left font-medium hover:text-sakura-600">
        {r.company_name}
        {r.grad_year ? ` · ${r.grad_year} 届` : ""}
        <ChevronDown className={cx("size-4 shrink-0 transition", open && "rotate-180")} />
      </button>
      <p className="text-xs text-muted">
        上报人 {r.reporter_email}（ID {r.reporter_id}）· {new Date(r.created_at).toLocaleString("zh-CN")}
        {r.reviewer_email && ` · 审核：${r.reviewer_email}`}
      </p>
      {r.review_note && <p className="mt-2 rounded-xl bg-stone-50 px-3 py-2 text-xs">{r.review_note}</p>}

      {open && (
        <div className="mt-3 space-y-3 border-t border-line pt-3">
          {r.existing && (
            <div className="rounded-xl bg-lemon-50/60 p-3">
              <p className="mb-1 text-xs font-medium text-lemon-700">当前公开的记录</p>
              <Summary o={r.existing} />
            </div>
          )}
          {r.status === "pending" ? (
            <>
              <p className="text-xs text-muted">下面是用户上报的内容，可以先修正再通过。通过后{r.existing ? "会覆盖上面的记录" : "会新建一条记录"}，日期或链接有变化时通知关注的用户。</p>
              <Fields f={f} set={set} />
              <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="驳回原因（会通知上报人）" />
              <ErrorNote message={error} />
              <div className="flex flex-wrap justify-end gap-2">
                <Button size="sm" variant="danger" disabled={busy} onClick={() => act("reject")}>
                  <X className="size-3.5" /> 驳回
                </Button>
                <Button size="sm" disabled={busy} onClick={() => act("approve")}>
                  <Check className="size-3.5" /> 通过并发 point
                </Button>
              </div>
            </>
          ) : (
            <Summary o={r} />
          )}
        </div>
      )}
    </div>
  );
}

/** "2026/10/01 10:00" → "2026-10-01T10:00"; anything else is passed through for the server to reject. */
function normDate(v: string) {
  const s = v.trim().replace(/\//g, "-");
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?$/);
  if (!m) return s;
  const p = (x: string) => x.padStart(2, "0");
  return `${m[1]}-${p(m[2])}-${p(m[3])}${m[4] ? `T${p(m[4])}:${m[5]}` : ""}`;
}

type Row = { company_name: string; grad_year: number | null; opens_at: string; deadline: string; url: string; note: string };

function parseRows(text: string): Row[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.split(l.includes("\t") ? "\t" : /[,，]/).map((c) => c.trim()))
    .filter((c) => !/^(公司|company)/i.test(c[0] ?? ""))
    .map(([company_name = "", gy = "", opens = "", deadline = "", url = "", ...note]) => ({
      company_name,
      grad_year: Number(gy) || null,
      opens_at: opens ? normDate(opens) : "",
      deadline: deadline ? normDate(deadline) : "",
      url,
      note: note.join(", "),
    }));
}

type BulkResult = { row: number; ok: boolean; created?: boolean; notified?: number; error?: string };

export function BulkPaste() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<BulkResult[] | null>(null);
  const rows = parseRows(text);

  async function submit() {
    setBusy(true);
    setError(null);
    setResults(null);
    try {
      const r = await api<{ results: BulkResult[] }>("/api/admin/openings", { body: { items: rows, notify } });
      setResults(r.results);
      if (r.results.every((x) => x.ok)) setText("");
      router.refresh();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  const ok = results?.filter((r) => r.ok) ?? [];
  return (
    <Card className="space-y-3">
      <div>
        <h2 className="font-semibold">批量粘贴</h2>
        <p className="mt-0.5 text-xs text-muted">
          从 Excel / 表格复制，每行一家：公司名、届、开放日期、截止日期、链接、备注（Tab 或逗号分隔，日期如 2026/10/01 或 2026-10-01 10:00，届和链接可留空）。同一公司同届已存在时会更新那一条。最多 200 行。
        </p>
      </div>
      <Textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder={"株式会社〇〇\t2028\t2026/10/01\t2026/11/15\thttps://example.co.jp/recruit\t"} className="font-mono text-xs" />
      <NotifyToggle notify={notify} setNotify={setNotify} />
      <ErrorNote message={error} />
      {results && (
        <div className="space-y-1 rounded-xl bg-stone-50 p-3 text-xs">
          <p className="font-medium">
            成功 {ok.length} 行（新建 {ok.filter((r) => r.created).length}，更新 {ok.filter((r) => !r.created).length}，通知 {ok.reduce((n, r) => n + (r.notified ?? 0), 0)} 人次）
            {results.length > ok.length && `，失败 ${results.length - ok.length} 行`}
          </p>
          {results
            .filter((r) => !r.ok)
            .map((r) => (
              <p key={r.row} className="text-sakura-700">
                第 {r.row} 行：{r.error}
              </p>
            ))}
        </div>
      )}
      <div className="flex items-center justify-end gap-3">
        <span className="text-sm text-muted">识别到 {rows.length} 行</span>
        <Button size="sm" loading={busy} disabled={!rows.length || rows.length > 200} onClick={submit}>
          全部保存
        </Button>
      </div>
    </Card>
  );
}
