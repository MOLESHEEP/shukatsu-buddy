"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ChevronLeft, PenLine, Plus, Trash2 } from "lucide-react";
import { Badge, Button, Card, ErrorNote, Field, Input, Select, Textarea, cx, toneDot, type Tone } from "@/components/ui";
import { COMPANY_STATUS, EVENT_KINDS, STAGE_RESULTS, TEST_FORMATS, TEST_STATUS, TEST_TYPES } from "@/lib/constants";
import { api, errMsg } from "@/lib/client";
import { formatDateTime, isoToLocalInput } from "@/lib/time";
import type { CalEvent, Company, Stage, Test } from "@/lib/data";
import { POST_KINDS, type Post } from "@/lib/community";
import { TimePill } from "@/components/post-view";

type Props = {
  company: Company;
  stages: Stage[];
  tests: Test[];
  events: CalEvent[];
  esDocs: { id: number; question: string; created_at: string }[];
  posts: Post[];
};

export function CompanyDetail({ company, stages, tests, events, esDocs, posts }: Props) {
  const router = useRouter();
  const status = COMPANY_STATUS[company.status];

  async function remove() {
    if (!confirm(`删除「${company.name}」及其所有记录？`)) return;
    await api(`/api/companies/${company.id}`, { method: "DELETE" });
    router.push("/tracker");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <Link href="/tracker" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ChevronLeft className="size-4" /> 选考追踪
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">{company.name}</h1>
            <Badge tone={status?.tone}>{status?.label}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted">
            {[company.industry, company.channel && `渠道：${company.channel}`, `当前阶段：${company.current_stage}`].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/es?company=${company.id}`}
            className="inline-flex items-center gap-1.5 rounded-full bg-sakura-50 px-4 py-2 text-sm font-medium text-sakura-700 hover:bg-sakura-100"
          >
            <PenLine className="size-4" /> 为这家公司写 ES
          </Link>
          <Button variant="danger" size="sm" onClick={remove}>
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-6">
          <StageEditor companyId={company.id} initial={stages} />
          <EventsCard companyId={company.id} events={events} />
        </div>
        <div className="space-y-6">
          <InfoCard company={company} />
          <TestsCard companyId={company.id} tests={tests} />
          <Card>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">前辈经验</h2>
              <Link href={`/community?q=${encodeURIComponent(company.name.replace(/株式会社|（株）/g, "").trim())}`} className="text-xs text-sakura-600 hover:underline">
                查看全部
              </Link>
            </div>
            {posts.length ? (
              <ul className="mt-2 divide-y divide-line">
                {posts.map((p) => (
                  <li key={p.id}>
                    <Link href={`/community/${p.id}`} className="block py-2.5 hover:text-sakura-600">
                      <div className="text-sm font-medium">{p.title}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                        {POST_KINDS[p.kind].emoji} {POST_KINDS[p.kind].label}
                        <TimePill post={p} />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted">还没有人分享这家公司的经验。</p>
            )}
            <Link href={`/community/new?company=${encodeURIComponent(company.name)}`} className="mt-3 inline-block text-sm font-medium text-sakura-600 hover:underline">
              ＋ 分享我在这里的经验
            </Link>
          </Card>
          {esDocs.length > 0 && (
            <Card>
              <h2 className="font-semibold">相关 ES</h2>
              <ul className="mt-2 divide-y divide-line">
                {esDocs.map((d) => (
                  <li key={d.id}>
                    <Link href={`/es?doc=${d.id}`} className="block truncate py-2.5 text-sm hover:text-sakura-600">
                      {d.question}
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function useSaver() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(fn: () => Promise<unknown>) {
    setSaving(true);
    setError(null);
    try {
      await fn();
      router.refresh();
      return true;
    } catch (e) {
      setError(errMsg(e));
      return false;
    } finally {
      setSaving(false);
    }
  }
  return { saving, error, run };
}

// ---------------- Stage flow ----------------

type StageDraft = { name: string; date: string; result: string };

function StageEditor({ companyId, initial }: { companyId: number; initial: Stage[] }) {
  const [rows, setRows] = useState<StageDraft[]>(initial.map((s) => ({ name: s.name, date: isoToLocalInput(s.date), result: s.result })));
  const [dirty, setDirty] = useState(false);
  const { saving, error, run } = useSaver();

  function update(i: number, patch: Partial<StageDraft>) {
    setRows((r) => r.map((row, j) => (j === i ? { ...row, ...patch } : row)));
    setDirty(true);
  }
  function moveRow(i: number, d: number) {
    setRows((r) => {
      const next = [...r];
      const j = i + d;
      if (j < 0 || j >= next.length) return r;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    setDirty(true);
  }
  async function save() {
    const ok = await run(() =>
      api(`/api/companies/${companyId}/stages`, { method: "PUT", body: { stages: rows.map((r) => ({ ...r, date: r.date || null })) } }),
    );
    if (ok) setDirty(false);
  }

  const resultTone: Record<string, Tone> = { pending: "stone", passed: "mint", failed: "rose" };

  return (
    <Card>
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">选考流程</h2>
        {dirty && (
          <Button size="sm" onClick={save} loading={saving}>
            保存
          </Button>
        )}
      </div>
      <ol className="mt-4 space-y-2">
        {rows.map((r, i) => (
          <li key={i} className="flex flex-wrap items-center gap-2 rounded-2xl bg-cream p-2 sm:flex-nowrap">
            <span className={cx("flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold", r.result === "passed" ? "bg-mint-100 text-mint-700" : r.result === "failed" ? "bg-sakura-100 text-sakura-700" : "bg-paper text-muted")}>
              {i + 1}
            </span>
            <Input className="min-w-0 flex-1 py-1.5" value={r.name} onChange={(e) => update(i, { name: e.target.value })} />
            <Input className="w-auto py-1.5" type="datetime-local" value={r.date} onChange={(e) => update(i, { date: e.target.value })} />
            <Select className={cx("w-auto py-1.5", r.result === "passed" && "text-mint-700", r.result === "failed" && "text-sakura-700")} value={r.result} onChange={(e) => update(i, { result: e.target.value })}>
              {Object.entries(STAGE_RESULTS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
            <div className="flex">
              <button className="rounded-lg p-1 text-muted hover:bg-paper" onClick={() => moveRow(i, -1)} aria-label="上移">
                <ArrowUp className="size-4" />
              </button>
              <button className="rounded-lg p-1 text-muted hover:bg-paper" onClick={() => moveRow(i, 1)} aria-label="下移">
                <ArrowDown className="size-4" />
              </button>
              <button
                className="rounded-lg p-1 text-muted hover:bg-sakura-50 hover:text-sakura-700"
                onClick={() => {
                  setRows((rs) => rs.filter((_, j) => j !== i));
                  setDirty(true);
                }}
                aria-label="删除"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-3 flex items-center justify-between">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setRows((r) => [...r, { name: "新阶段", date: "", result: "pending" }]);
            setDirty(true);
          }}
        >
          <Plus className="size-4" /> 添加阶段
        </Button>
        <span className="flex gap-1.5">
          {Object.entries(STAGE_RESULTS).map(([k, v]) => (
            <Badge key={k} tone={resultTone[k]}>
              {v}
            </Badge>
          ))}
        </span>
      </div>
      <ErrorNote message={error} />
    </Card>
  );
}

// ---------------- Basic info + next step ----------------

function InfoCard({ company }: { company: Company }) {
  const [form, setForm] = useState({
    industry: company.industry,
    channel: company.channel,
    status: company.status,
    next_action: company.next_action,
    next_deadline: isoToLocalInput(company.next_deadline),
    notes: company.notes,
  });
  const [dirty, setDirty] = useState(false);
  const { saving, error, run } = useSaver();
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setDirty(true);
  };
  async function save() {
    if (await run(() => api(`/api/companies/${company.id}`, { method: "PATCH", body: { ...form, next_deadline: form.next_deadline || null } }))) setDirty(false);
  }
  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">下一步 & 信息</h2>
        {dirty && (
          <Button size="sm" onClick={save} loading={saving}>
            保存
          </Button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="下一步">
          <Input value={form.next_action} onChange={set("next_action")} placeholder="例：一次面试准备" />
        </Field>
        <Field label="截止">
          <Input type="datetime-local" value={form.next_deadline} onChange={set("next_deadline")} />
        </Field>
        <Field label="行业">
          <Input value={form.industry} onChange={set("industry")} />
        </Field>
        <Field label="渠道">
          <Input value={form.channel} onChange={set("channel")} />
        </Field>
      </div>
      <Field label="状态">
        <Select value={form.status} onChange={set("status")}>
          {Object.entries(COMPANY_STATUS).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="备注" hint="ES 添削时 AI 会参考">
        <Textarea rows={4} value={form.notes} onChange={set("notes")} placeholder="事业内容、企业理念、说明会笔记…" />
      </Field>
      <ErrorNote message={error} />
    </Card>
  );
}

// ---------------- Written tests ----------------

function TestsCard({ companyId, tests }: { companyId: number; tests: Test[] }) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ type: "spi", format: "web", deadline: "" });
  const { saving, error, run } = useSaver();

  async function add() {
    if (await run(() => api(`/api/companies/${companyId}/tests`, { body: { ...form, deadline: form.deadline || null } }))) setAdding(false);
  }
  return (
    <Card>
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">笔试</h2>
        <Button size="sm" variant="ghost" onClick={() => setAdding((a) => !a)}>
          <Plus className="size-4" /> 记录
        </Button>
      </div>
      {tests.length === 0 && !adding && <p className="mt-2 text-sm text-muted">还没有记录。收到受检通知后，在「邮件助手」粘贴即可自动识别类型。</p>}
      <ul className="mt-2 space-y-2">
        {tests.map((t) => {
          const info = TEST_TYPES[t.type as keyof typeof TEST_TYPES] ?? TEST_TYPES.unknown;
          return (
            <li key={t.id} className="rounded-2xl bg-lemon-50/60 p-3">
              <div className="flex items-center justify-between gap-2">
                <Link href={`/tests#${t.type}`} className="font-medium text-lemon-700 hover:underline">
                  {info.label}
                </Link>
                <div className="flex items-center gap-1">
                  <Select
                    className="w-auto py-1 text-xs"
                    value={t.status}
                    onChange={(e) => run(() => api(`/api/tests/${t.id}`, { method: "PATCH", body: { status: e.target.value } }))}
                  >
                    {Object.entries(TEST_STATUS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </Select>
                  <button className="rounded-lg p-1 text-muted hover:text-sakura-700" onClick={() => run(() => api(`/api/tests/${t.id}`, { method: "DELETE" }))} aria-label="删除">
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>
              <div className="mt-1 text-xs text-muted">
                {TEST_FORMATS[t.format] ?? t.format}
                {t.deadline && ` · 期限 ${formatDateTime(t.deadline)}`}
                {t.confidence != null && t.confidence < 0.7 && " · AI 推测，请核对"}
              </div>
            </li>
          );
        })}
      </ul>
      {adding && (
        <div className="mt-3 space-y-2 rounded-2xl border border-line p-3">
          <div className="grid grid-cols-2 gap-2">
            <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              {Object.entries(TEST_TYPES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </Select>
            <Select value={form.format} onChange={(e) => setForm({ ...form, format: e.target.value })}>
              {Object.entries(TEST_FORMATS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </div>
          <Field label="受检期限">
            <Input type="datetime-local" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} />
          </Field>
          <Button size="sm" onClick={add} loading={saving} className="w-full">
            添加
          </Button>
        </div>
      )}
      <ErrorNote message={error} />
    </Card>
  );
}

// ---------------- Events ----------------

function EventsCard({ companyId, events }: { companyId: number; events: CalEvent[] }) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ kind: "interview", title: "", starts_at: "", location: "", prep: "" });
  const { saving, error, run } = useSaver();

  async function add() {
    const ok = await run(() => api(`/api/companies/${companyId}/events`, { body: form }));
    if (ok) {
      setAdding(false);
      setForm({ kind: "interview", title: "", starts_at: "", location: "", prep: "" });
    }
  }
  return (
    <Card>
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">日程</h2>
        <Button size="sm" variant="ghost" onClick={() => setAdding((a) => !a)}>
          <Plus className="size-4" /> 添加
        </Button>
      </div>
      {events.length === 0 && !adding && <p className="mt-2 text-sm text-muted">说明会、面试、截止日都可以记在这里，会出现在日历和提醒中。</p>}
      <ul className="mt-2 divide-y divide-line">
        {events.map((e) => {
          const kind = EVENT_KINDS[e.kind] ?? EVENT_KINDS.other;
          const past = new Date(e.starts_at).getTime() < Date.now();
          return (
            <li key={e.id} className={cx("flex items-start gap-3 py-3", past && "opacity-50")}>
              <span className={cx("mt-1.5 size-2.5 shrink-0 rounded-full", toneDot[kind.tone as Tone])} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{e.title}</div>
                <div className="mt-0.5 text-xs text-muted">
                  {kind.label} · {formatDateTime(e.starts_at)}
                  {e.location && ` · ${e.location}`}
                </div>
                {e.prep && <div className="mt-1 text-xs text-violet-700">📝 {e.prep}</div>}
              </div>
              <button className="rounded-lg p-1 text-muted hover:text-sakura-700" onClick={() => run(() => api(`/api/events/${e.id}`, { method: "DELETE" }))} aria-label="删除">
                <Trash2 className="size-4" />
              </button>
            </li>
          );
        })}
      </ul>
      {adding && (
        <div className="mt-3 grid gap-2 rounded-2xl border border-line p-3 sm:grid-cols-2">
          <Select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
            {Object.entries(EVENT_KINDS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </Select>
          <Input type="datetime-local" value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} />
          <Input className="sm:col-span-2" placeholder="标题，例：一次面试" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <Input className="sm:col-span-2" placeholder="地点或线上链接" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          <Input className="sm:col-span-2" placeholder="准备事项" value={form.prep} onChange={(e) => setForm({ ...form, prep: e.target.value })} />
          <Button size="sm" onClick={add} loading={saving} disabled={!form.title || !form.starts_at} className="sm:col-span-2">
            添加日程
          </Button>
        </div>
      )}
      <ErrorNote message={error} />
    </Card>
  );
}
