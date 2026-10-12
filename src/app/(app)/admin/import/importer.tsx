"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, CircleAlert, CircleCheck, Download, FileUp, Sparkles, Table2, Trash2, Upload } from "lucide-react";
import { Badge, Button, Card, EmptyState, ErrorNote, Field, Input, Select, Textarea, cx } from "@/components/ui";
import { PostBody, TimePill } from "@/components/post-view";
import { EMPLOYMENT_TYPES, INTERVIEW_STAGES, POST_KINDS, POST_RESULTS, type PostKind } from "@/lib/community";
import { CSV_TEMPLATE, csvToObjects, jsonToObjects, toImportRows, validateRow, type ImportRow, type PostDraftRow } from "@/lib/import";
import { api, errMsg } from "@/lib/client";

export type BatchRow = { id: string; label: string; method: string; count: number; created_at: string; drafts: number; published: number; remaining: number };

export function Importer({ batches }: { batches: BatchRow[] }) {
  const router = useRouter();
  const [method, setMethod] = useState<"table" | "ai">("table");
  const [text, setText] = useState("");
  const [aiText, setAiText] = useState("");
  const [defaults, setDefaults] = useState({ anonymous: true, source: "" });
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [publish, setPublish] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [label, setLabel] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  function load(next: ImportRow[], extraNotes: string[] = []) {
    setRows(next);
    setSelected(new Set(next.filter((r) => !r.errors.length).map((r) => r.key)));
    setNotes(extraNotes);
    setDone(null);
    setError(next.length ? null : "没有读到任何数据，请检查格式");
  }

  function parseTable(src = text) {
    try {
      const trimmed = src.trim();
      if (trimmed.startsWith("[") || trimmed.startsWith("{")) return load(toImportRows(jsonToObjects(trimmed), defaults));
      const { rows: objs, unknownHeaders } = csvToObjects(trimmed);
      load(toImportRows(objs, defaults), unknownHeaders.length ? [`已忽略无法识别的列：${unknownHeaders.join("、")}`] : []);
    } catch (e) {
      setError("解析失败：" + errMsg(e));
    }
  }

  async function onFile(f: File | undefined) {
    if (!f) return;
    const content = await f.text();
    setText(content);
    parseTable(content);
  }

  async function runAi() {
    setBusy("ai");
    setError(null);
    try {
      const r = await api<{ rows: Record<string, unknown>[]; skipped: string[] }>("/api/admin/import/ai", { body: { text: aiText } });
      load(toImportRows(r.rows, defaults), r.skipped.map((s) => `AI 跳过：${s}`));
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(null);
    }
  }

  function downloadTemplate() {
    // BOM so Excel opens the Chinese headers correctly.
    const blob = new Blob(["﻿" + CSV_TEMPLATE], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "经验分享导入模板.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function updateRow(key: string, patch: Partial<PostDraftRow>) {
    setRows((rs) =>
      rs.map((r) => {
        if (r.key !== key) return r;
        const data = { ...r.data, ...patch };
        return { ...r, data, errors: validateRow(data) };
      }),
    );
  }

  const valid = rows.filter((r) => !r.errors.length);
  const chosen = rows.filter((r) => selected.has(r.key));
  const chosenInvalid = chosen.filter((r) => r.errors.length);

  async function commit() {
    setBusy("commit");
    setError(null);
    try {
      const r = await api<{ batchId: string; count: number }>("/api/admin/import", {
        body: { rows: chosen.map((r) => r.data), publish, confirmed, batchLabel: label, method },
      });
      setDone(`已导入 ${r.count} 篇${publish ? "并发布" : "（草稿）"}，批次 ${r.batchId}`);
      setRows((rs) => rs.filter((x) => !selected.has(x.key)));
      setSelected(new Set());
      setConfirmed(false);
      router.refresh();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-full bg-stone-50 p-1">
            {[
              { k: "table" as const, label: "表格导入（CSV / JSON）", icon: Table2 },
              { k: "ai" as const, label: "AI 整理原始材料", icon: Sparkles },
            ].map((t) => (
              <button
                key={t.k}
                onClick={() => setMethod(t.k)}
                className={cx("flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition", method === t.k ? "bg-violet-500 text-white" : "text-muted hover:text-ink")}
              >
                <t.icon className="size-4" />
                {t.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={defaults.anonymous} onChange={(e) => setDefaults((d) => ({ ...d, anonymous: e.target.checked }))} className="accent-sakura-500" />
              默认匿名
            </label>
            <Input className="w-56 py-1.5" placeholder="默认来源（可选，显示在帖子上）" value={defaults.source} onChange={(e) => setDefaults((d) => ({ ...d, source: e.target.value }))} />
          </div>
        </div>

        {method === "table" ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="soft" onClick={downloadTemplate}>
                <Download className="size-3.5" /> 下载 CSV 模板
              </Button>
              <Button size="sm" variant="ghost" onClick={() => fileRef.current?.click()}>
                <FileUp className="size-3.5" /> 上传文件（.csv / .tsv / .json）
              </Button>
              <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,.json,text/csv,application/json" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
            </div>
            <Textarea
              rows={8}
              className="font-mono text-xs"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={"也可以直接粘贴：从 Excel / Google 表格复制（含表头）或 JSON 数组。\n表头支持中文：类型, 公司, 行业, 职种, 时间, 结束, 届, 阶段, 结果, 雇佣形式, 评分, 标题, 正文, 标签, 匿名, 来源\n正文里用 \\n 换行，「## 」开头为小标题。"}
            />
            <Button onClick={() => parseTable()} disabled={!text.trim()}>
              <Upload className="size-4" /> 解析并预览
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <Textarea
              rows={10}
              value={aiText}
              onChange={(e) => setAiText(e.target.value)}
              placeholder={"粘贴访谈记录、问卷回答、群聊整理等原始材料，可以包含多个人、多家公司。\nAI 会拆分成多篇经验分享并分小节整理；只使用材料中的事实，缺少的时间会留空让你补充。"}
            />
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={runAi} loading={busy === "ai"} disabled={aiText.trim().length < 20}>
                <Sparkles className="size-4" /> {busy === "ai" ? "AI 正在拆分整理…（材料长时需要 1–3 分钟）" : "AI 拆分整理"}
              </Button>
              <span className="text-xs text-muted">{aiText.length.toLocaleString()} / 60,000 字</span>
            </div>
          </div>
        )}
        <ErrorNote message={error} />
        {done && (
          <p className="rounded-xl bg-mint-50 px-3.5 py-2.5 text-sm text-mint-700">
            ✓ {done} ·{" "}
            <Link href="/community?tab=mine" className="underline">
              在「我的分享」中查看
            </Link>
          </p>
        )}
      </Card>

      {rows.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">
              预览 <span className="text-sm font-normal text-muted">共 {rows.length} 篇 · 可导入 {valid.length} · 需修正 {rows.length - valid.length}</span>
            </h2>
            <div className="flex gap-2 text-xs">
              <button className="text-sakura-600 hover:underline" onClick={() => setSelected(new Set(valid.map((r) => r.key)))}>
                选中全部可导入
              </button>
              <button className="text-muted hover:underline" onClick={() => setSelected(new Set())}>
                全不选
              </button>
            </div>
          </div>
          {notes.map((n, i) => (
            <p key={i} className="rounded-xl bg-lemon-50 px-3 py-2 text-xs text-lemon-700">
              {n}
            </p>
          ))}
          {rows.map((r) => (
            <RowCard
              key={r.key}
              row={r}
              checked={selected.has(r.key)}
              onCheck={(v) =>
                setSelected((s) => {
                  const n = new Set(s);
                  if (v) n.add(r.key);
                  else n.delete(r.key);
                  return n;
                })
              }
              onChange={(patch) => updateRow(r.key, patch)}
              onRemove={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
            />
          ))}

          <Card className="sticky bottom-20 space-y-3 border-violet-100 md:bottom-4">
            <div className="flex flex-wrap items-center gap-3">
              <Input className="w-64 py-1.5" placeholder="批次备注（可选，如：2027 春季访谈）" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} />
              <div className="flex rounded-full bg-stone-50 p-0.5 text-sm">
                {[
                  { v: false, label: "导入为草稿" },
                  { v: true, label: "直接发布" },
                ].map((o) => (
                  <button
                    key={String(o.v)}
                    onClick={() => setPublish(o.v)}
                    className={cx("rounded-full px-3 py-1 font-medium transition", publish === o.v ? "bg-paper shadow-sm" : "text-muted")}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
            {publish && (
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5 size-4 accent-sakura-500" />
                我已检查选中的 {chosen.length} 篇：内容属实、已获得分享授权，且不含他人隐私或公司机密。
              </label>
            )}
            {chosenInvalid.length > 0 && <p className="text-xs text-sakura-700">选中的内容里有 {chosenInvalid.length} 篇还有问题，请修正或取消勾选。</p>}
            <Button onClick={commit} loading={busy === "commit"} disabled={!chosen.length || chosenInvalid.length > 0 || (publish && !confirmed)}>
              {publish ? "发布" : "导入"} {chosen.length} 篇
            </Button>
            {!publish && <p className="text-xs text-muted">草稿只有你能看到，可以在「我的分享」逐篇修改后发布，或在下方批次列表里一键全部发布。</p>}
          </Card>
        </div>
      )}

      <Batches batches={batches} />
    </div>
  );
}

function RowCard({
  row,
  checked,
  onCheck,
  onChange,
  onRemove,
}: {
  row: ImportRow;
  checked: boolean;
  onCheck: (v: boolean) => void;
  onChange: (p: Partial<PostDraftRow>) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(row.errors.length > 0);
  const [preview, setPreview] = useState(false);
  const d = row.data;
  const kind = (d.kind === "work" ? "work" : "interview") as PostKind;
  const timeOk = /^\d{4}-\d{2}$/.test(d.occurred_on);
  const pill = useMemo(() => ({ kind, occurred_on: d.occurred_on, ended_on: d.ended_on, grad_year: d.grad_year }), [kind, d.occurred_on, d.ended_on, d.grad_year]);

  return (
    <div className={cx("rounded-2xl border bg-paper p-3.5 shadow-[var(--shadow-soft)]", row.errors.length ? "border-sakura-100" : "border-line")}>
      <div className="flex items-start gap-3">
        <input type="checkbox" checked={checked} disabled={row.errors.length > 0} onChange={(e) => onCheck(e.target.checked)} className="mt-1 size-4 accent-violet-500" />
        <button className="min-w-0 flex-1 text-left" onClick={() => setOpen((o) => !o)}>
          <div className="flex flex-wrap items-center gap-1.5">
            {row.errors.length ? <CircleAlert className="size-4 text-sakura-500" /> : <CircleCheck className="size-4 text-mint-500" />}
            <Badge tone={POST_KINDS[kind].tone}>{POST_KINDS[kind].label}</Badge>
            <span className="text-sm font-medium">{d.company_name || "（缺公司）"}</span>
            {timeOk ? <TimePill post={pill} /> : <Badge tone="rose">缺时间</Badge>}
            {d.source && <span className="text-xs text-muted">来源：{d.source}</span>}
          </div>
          <div className="mt-1 truncate text-sm">{d.title || <span className="text-muted">（缺标题）</span>}</div>
          {row.errors.length > 0 && <div className="mt-1 text-xs text-sakura-700">{row.errors.join("；")}</div>}
        </button>
        <button onClick={onRemove} className="rounded-lg p-1.5 text-muted hover:bg-sakura-50 hover:text-sakura-700" aria-label="移除">
          <Trash2 className="size-4" />
        </button>
        <button onClick={() => setOpen((o) => !o)} className="rounded-lg p-1.5 text-muted hover:bg-stone-50" aria-label="编辑">
          <ChevronDown className={cx("size-4 transition", open && "rotate-180")} />
        </button>
      </div>

      {open && (
        <div className="mt-3 space-y-3 border-t border-line pt-3">
          <div className="grid gap-2 sm:grid-cols-4">
            <Field label="类型">
              <Select value={kind} onChange={(e) => onChange({ kind: e.target.value })}>
                <option value="interview">面试经验</option>
                <option value="work">工作体验</option>
              </Select>
            </Field>
            <Field label="公司">
              <Input value={d.company_name} onChange={(e) => onChange({ company_name: e.target.value })} />
            </Field>
            <Field label="行业">
              <Input value={d.industry} onChange={(e) => onChange({ industry: e.target.value })} />
            </Field>
            <Field label="职种">
              <Input value={d.role} onChange={(e) => onChange({ role: e.target.value })} />
            </Field>
            <Field label={kind === "interview" ? "面试时间" : "入职时间"}>
              <Input type="month" value={timeOk ? d.occurred_on : ""} onChange={(e) => onChange({ occurred_on: e.target.value })} className={cx(!timeOk && "border-sakura-300")} />
            </Field>
            {kind === "interview" ? (
              <>
                <Field label="届（毕业年份）">
                  <Input type="number" value={d.grad_year ?? ""} onChange={(e) => onChange({ grad_year: e.target.value ? Number(e.target.value) : null })} />
                </Field>
                <Field label="阶段">
                  <Select value={d.stage} onChange={(e) => onChange({ stage: e.target.value })}>
                    <option value="">—</option>
                    {[...new Set([...INTERVIEW_STAGES, d.stage].filter(Boolean))].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="结果">
                  <Select value={d.result} onChange={(e) => onChange({ result: e.target.value })}>
                    {Object.entries(POST_RESULTS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </>
            ) : (
              <>
                <Field label="离职时间" hint="空 = 至今">
                  <Input type="month" value={d.ended_on ?? ""} onChange={(e) => onChange({ ended_on: e.target.value || null })} />
                </Field>
                <Field label="雇佣形式">
                  <Select value={d.employment_type} onChange={(e) => onChange({ employment_type: e.target.value })}>
                    <option value="">—</option>
                    {[...new Set([...EMPLOYMENT_TYPES, d.employment_type].filter(Boolean))].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="评分">
                  <Select value={d.rating ?? ""} onChange={(e) => onChange({ rating: e.target.value ? Number(e.target.value) : null })}>
                    <option value="">—</option>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {"★".repeat(n)}
                      </option>
                    ))}
                  </Select>
                </Field>
              </>
            )}
          </div>
          <Field label="标题">
            <Input value={d.title} maxLength={80} onChange={(e) => onChange({ title: e.target.value })} />
          </Field>
          <Field label="正文" hint={<button className="text-sky-700 hover:underline" onClick={() => setPreview((p) => !p)}>{preview ? "编辑" : "预览"}</button>}>
            {preview ? (
              <div className="rounded-xl border border-line p-3 text-sm">
                <PostBody body={d.body} />
              </div>
            ) : (
              <Textarea rows={8} value={d.body} onChange={(e) => onChange({ body: e.target.value })} />
            )}
          </Field>
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <Field label="标签" hint="顿号分隔">
              <Input value={d.tags.join("、")} onChange={(e) => onChange({ tags: e.target.value.split(/[、,，\s]+/).filter(Boolean).slice(0, 8) })} />
            </Field>
            <Field label="来源">
              <Input value={d.source} onChange={(e) => onChange({ source: e.target.value })} placeholder="如：2027 春季前辈访谈" />
            </Field>
            <label className="flex items-end gap-1.5 pb-2.5 text-sm">
              <input type="checkbox" checked={d.anonymous} onChange={(e) => onChange({ anonymous: e.target.checked })} className="accent-sakura-500" />
              匿名
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

function Batches({ batches }: { batches: BatchRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function act(id: string, kind: "publish" | "delete", b: BatchRow) {
    const msg =
      kind === "publish"
        ? `发布批次「${b.label || b.id}」里的 ${b.drafts} 篇草稿？请确认内容已检查过。`
        : `删除批次「${b.label || b.id}」的全部 ${b.remaining} 篇分享？此操作不可恢复。`;
    if (!confirm(msg)) return;
    setBusy(id);
    setError(null);
    try {
      await api(`/api/admin/import/${id}`, kind === "publish" ? { method: "PATCH", body: { action: "publish", confirmed: true } } : { method: "DELETE" });
      router.refresh();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="space-y-2">
      <h2 className="font-semibold">导入记录</h2>
      <ErrorNote message={error} />
      {batches.length === 0 ? (
        <EmptyState title="还没有导入过" />
      ) : (
        batches.map((b) => (
          <div key={b.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-paper px-4 py-3 text-sm shadow-[var(--shadow-soft)]">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-medium">{b.label || "未命名批次"}</span>
                <Badge tone={b.method === "ai" ? "violet" : "sky"}>{b.method === "ai" ? "AI 整理" : "表格"}</Badge>
                <span className="font-mono text-xs text-muted">{b.id}</span>
              </div>
              <div className="text-xs text-muted">
                {new Date(b.created_at).toLocaleString("zh-CN")} · 导入 {b.count} 篇 · 现存已发布 {b.published} / 草稿 {b.drafts}
                {b.remaining < b.count && ` · 已删除 ${b.count - b.remaining}`}
              </div>
            </div>
            {b.drafts > 0 && (
              <Button size="sm" variant="soft" disabled={busy === b.id} onClick={() => act(b.id, "publish", b)}>
                全部发布
              </Button>
            )}
            {b.remaining > 0 && (
              <Button size="sm" variant="danger" disabled={busy === b.id} onClick={() => act(b.id, "delete", b)}>
                <Trash2 className="size-3.5" /> 撤销整批
              </Button>
            )}
          </div>
        ))
      )}
    </div>
  );
}
