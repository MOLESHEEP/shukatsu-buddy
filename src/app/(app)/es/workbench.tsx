"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BookMarked, Check, Copy, Library, Sparkles, Trash2, WandSparkles } from "lucide-react";
import { Badge, Button, Card, EmptyState, ErrorNote, Field, Input, Select, Textarea, cx } from "@/components/ui";
import { ES_TEMPLATES, MATERIAL_TAGS } from "@/lib/constants";
import { api, countChars, errMsg } from "@/lib/client";
import type { EsReview } from "@/lib/llm/schemas";

export type EsDoc = {
  id: number;
  company_id: number | null;
  company_name: string;
  question: string;
  char_limit: number | null;
  draft: string;
  rewritten: string;
  review: EsReview | null;
  is_material: boolean;
  material_tag: string;
  created_at: string;
};

type Result = { id: number; review: EsReview; count: number; limit: number | null; over: boolean };

export function EsWorkbench({
  companies,
  docs,
  initialCompanyId,
  initialDocId,
}: {
  companies: { id: number; name: string }[];
  docs: EsDoc[];
  initialCompanyId: number | null;
  initialDocId: number | null;
}) {
  const router = useRouter();
  const initialDoc = docs.find((d) => d.id === initialDocId) ?? null;
  const [companyId, setCompanyId] = useState<number | "">(initialDoc?.company_id ?? initialCompanyId ?? "");
  const [companyName, setCompanyName] = useState(initialDoc?.company_name ?? "");
  const [question, setQuestion] = useState(initialDoc?.question ?? "");
  const [limit, setLimit] = useState<string>(initialDoc?.char_limit ? String(initialDoc.char_limit) : "400");
  const [draft, setDraft] = useState(initialDoc?.draft ?? "");
  const [result, setResult] = useState<Result | null>(
    initialDoc?.review
      ? { id: initialDoc.id, review: initialDoc.review, count: countChars(initialDoc.rewritten), limit: initialDoc.char_limit, over: false }
      : null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"history" | "library">("history");

  const materials = useMemo(() => docs.filter((d) => d.is_material), [docs]);
  const draftCount = countChars(draft);

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      const res = await api<Result>("/api/es/review", {
        body: {
          company_id: companyId === "" ? null : companyId,
          company_name: companyName,
          question,
          char_limit: limit ? Number(limit) : null,
          draft,
        },
      });
      setResult(res);
      router.refresh();
      setTimeout(() => document.getElementById("es-result")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }

  function loadDoc(d: EsDoc, asMaterial = false) {
    if (asMaterial) {
      // Reuse a saved answer as the starting draft for a different company.
      setDraft(d.rewritten || d.draft);
      setResult(null);
    } else {
      setCompanyId(d.company_id ?? "");
      setCompanyName(d.company_name);
      setQuestion(d.question);
      setLimit(d.char_limit ? String(d.char_limit) : "");
      setDraft(d.draft);
      setResult(d.review ? { id: d.id, review: d.review, count: countChars(d.rewritten), limit: d.char_limit, over: false } : null);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="公司">
              <Select
                value={companyId}
                onChange={(e) => {
                  const v = e.target.value;
                  setCompanyId(v ? Number(v) : "");
                  if (v) setCompanyName(companies.find((c) => c.id === Number(v))?.name ?? "");
                }}
              >
                <option value="">— 不关联 / 手动填写 —</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            {companyId === "" ? (
              <Field label="公司名">
                <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="例：株式会社〇〇" />
              </Field>
            ) : (
              <Field label="字数上限" hint="日文字符">
                <Input type="number" min={50} value={limit} onChange={(e) => setLimit(e.target.value)} />
              </Field>
            )}
          </div>

          <Field label="ES 题目">
            <Textarea rows={2} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="例：学生時代に最も力を入れたことを教えてください。" />
          </Field>
          <div className="-mt-2 flex flex-wrap gap-1.5">
            {ES_TEMPLATES.map((t) => (
              <button
                key={t.tag}
                type="button"
                onClick={() => setQuestion(t.question)}
                className="rounded-full bg-stone-50 px-2.5 py-1 text-xs text-muted transition hover:bg-sakura-50 hover:text-sakura-700"
              >
                {t.tag}
              </button>
            ))}
          </div>

          {companyId === "" && (
            <Field label="字数上限" hint="日文字符，留空表示不限">
              <Input type="number" min={50} value={limit} onChange={(e) => setLimit(e.target.value)} />
            </Field>
          )}

          <Field
            label="你的草稿"
            hint={
              <span className={cx("tabular-nums", limit && draftCount > Number(limit) && "text-lemon-700")}>
                {draftCount} 字{limit ? ` / ${limit}` : ""}
              </span>
            }
          >
            <Textarea rows={10} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="用中文写也没关系，把你的经历、想法写清楚就好。" />
          </Field>

          {materials.length > 0 && (
            <div className="flex items-center gap-2 text-sm">
              <Library className="size-4 text-muted" />
              <Select
                className="py-1.5"
                value=""
                onChange={(e) => {
                  const d = materials.find((m) => m.id === Number(e.target.value));
                  if (d) loadDoc(d, true);
                }}
              >
                <option value="">从素材库导入…</option>
                {materials.map((m) => (
                  <option key={m.id} value={m.id}>
                    [{m.material_tag || "素材"}] {m.question.slice(0, 28)}
                  </option>
                ))}
              </Select>
            </div>
          )}

          <ErrorNote message={error} />
          <Button onClick={submit} loading={loading} disabled={!question.trim() || draft.trim().length < 10} className="w-full">
            <WandSparkles className="size-4" />
            {loading ? "AI 正在添削…（约 20–60 秒）" : "开始添削"}
          </Button>
        </Card>

        <div id="es-result" className="scroll-mt-6">
          {result ? (
            <ResultPanel result={result} onSaved={() => router.refresh()} saved={docs.find((d) => d.id === result.id)} />
          ) : (
            <Card className="flex h-full min-h-72 flex-col items-center justify-center bg-gradient-to-br from-sakura-50/60 to-paper text-center">
              <Sparkles className="size-8 text-sakura-300" />
              <p className="mt-3 font-medium">改写结果会出现在这里</p>
              <ul className="mt-3 space-y-1 text-sm text-muted">
                <li>· 日文改写稿（严格控制字数）</li>
                <li>· 逐句中文说明：哪里不自然、人事会怎么理解</li>
                <li>· 结构评分：结论先行 / 具体事例 / 公司关联</li>
              </ul>
            </Card>
          )}
        </div>
      </div>

      <Card>
        <div className="mb-3 flex gap-1">
          {(["history", "library"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cx("rounded-full px-3.5 py-1.5 text-sm font-medium transition", tab === t ? "bg-sakura-50 text-sakura-700" : "text-muted hover:bg-stone-50")}
            >
              {t === "history" ? "添削记录" : `素材库 (${materials.length})`}
            </button>
          ))}
        </div>
        <DocList docs={tab === "history" ? docs : materials} mode={tab} onOpen={loadDoc} />
      </Card>
    </div>
  );
}

function ScoreBar({ label, score, comment }: { label: string; score: number; comment: string }) {
  const s = Math.max(1, Math.min(5, score));
  const color = s >= 4 ? "bg-mint-500" : s >= 3 ? "bg-lemon-500" : "bg-sakura-500";
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-muted">{s} / 5</span>
      </div>
      <div className="mt-1.5 flex gap-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <span key={i} className={cx("h-1.5 flex-1 rounded-full", i <= s ? color : "bg-stone-100")} />
        ))}
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-muted">{comment}</p>
    </div>
  );
}

function ResultPanel({ result, saved, onSaved }: { result: Result; saved?: EsDoc; onSaved: () => void }) {
  const { review } = result;
  const [copied, setCopied] = useState(false);
  const [tag, setTag] = useState<string>(saved?.material_tag || "ガクチカ");
  const [isMaterial, setIsMaterial] = useState(saved?.is_material ?? false);
  const count = countChars(review.rewritten);
  const over = !!result.limit && count > result.limit;

  async function copy() {
    await navigator.clipboard.writeText(review.rewritten);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  async function toggleMaterial() {
    const next = !isMaterial;
    await api(`/api/es/${result.id}`, { method: "PATCH", body: { is_material: next, material_tag: tag } });
    setIsMaterial(next);
    onSaved();
  }

  return (
    <div className="animate-rise space-y-4">
      <Card className="border-sakura-100">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">日文改写稿</h2>
          <div className="flex items-center gap-2">
            <Badge tone={over ? "lemon" : "mint"}>
              {count}
              {result.limit ? ` / ${result.limit}` : ""} 字
            </Badge>
            <Button size="sm" variant="soft" onClick={copy}>
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              {copied ? "已复制" : "复制"}
            </Button>
          </div>
        </div>
        <p lang="ja" className="mt-3 whitespace-pre-wrap rounded-2xl bg-cream px-4 py-3 leading-loose">
          {review.rewritten}
        </p>
        {over && <p className="mt-2 text-xs text-lemon-700">仍略超字数上限，可以删减一个修饰语或合并句子。</p>}
        <p className="mt-3 text-sm text-muted">{review.summary_zh}</p>
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
          <BookMarked className="size-4 text-muted" />
          <span className="text-sm text-muted">存入素材库，下次复用：</span>
          <Select className="w-auto py-1.5" value={tag} onChange={(e) => setTag(e.target.value)}>
            {MATERIAL_TAGS.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
          <Button size="sm" variant={isMaterial ? "soft" : "primary"} onClick={toggleMaterial}>
            {isMaterial ? "已存入 ✓" : "存入"}
          </Button>
        </div>
      </Card>

      <Card>
        <h2 className="font-semibold">结构评分</h2>
        <div className="mt-4 grid gap-5 sm:grid-cols-3">
          <ScoreBar label="结论先行" score={review.scores.conclusion_first.score} comment={review.scores.conclusion_first.comment_zh} />
          <ScoreBar label="具体事例" score={review.scores.specificity.score} comment={review.scores.specificity.comment_zh} />
          <ScoreBar label="公司关联" score={review.scores.company_fit.score} comment={review.scores.company_fit.comment_zh} />
        </div>
      </Card>

      <Card>
        <h2 className="font-semibold">逐句说明</h2>
        <ol className="mt-3 space-y-4">
          {review.notes.map((n, i) => (
            <li key={i} className="rounded-2xl border border-line p-4">
              <p className="text-sm text-muted line-through decoration-sakura-300">{n.original}</p>
              <p lang="ja" className="mt-1.5 text-sm font-medium text-mint-700">
                → {n.revised}
              </p>
              <p className="mt-2.5 text-sm leading-relaxed">{n.issue_zh}</p>
              <p className="mt-1.5 rounded-xl bg-sky-50 px-3 py-2 text-xs leading-relaxed text-sky-700">👀 人事视角：{n.hr_view_zh}</p>
            </li>
          ))}
        </ol>
        {review.next_steps_zh.length > 0 && (
          <div className="mt-4 rounded-2xl bg-lemon-50 px-4 py-3 text-sm text-lemon-700">
            <p className="font-medium">你还可以自己改进：</p>
            <ul className="mt-1 list-inside list-disc space-y-0.5">
              {review.next_steps_zh.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>
        )}
      </Card>
    </div>
  );
}

function DocList({ docs, mode, onOpen }: { docs: EsDoc[]; mode: "history" | "library"; onOpen: (d: EsDoc, asMaterial?: boolean) => void }) {
  const router = useRouter();
  if (!docs.length) {
    return (
      <EmptyState title={mode === "history" ? "还没有添削记录" : "素材库是空的"}>
        {mode === "library" ? "把写得好的ガクチカ、自己PR存进来，下次写别家公司时一键复用。" : "完成第一次添削后会显示在这里。"}
      </EmptyState>
    );
  }
  async function remove(id: number) {
    if (!confirm("删除这条记录？")) return;
    await api(`/api/es/${id}`, { method: "DELETE" });
    router.refresh();
  }
  return (
    <ul className="divide-y divide-line">
      {docs.map((d) => (
        <li key={d.id} className="flex items-center gap-3 py-3">
          <button onClick={() => onOpen(d, mode === "library")} className="min-w-0 flex-1 text-left">
            <div className="flex items-center gap-2">
              {d.is_material && <Badge tone="violet">{d.material_tag || "素材"}</Badge>}
              <span className="truncate text-sm font-medium">{d.question}</span>
            </div>
            <div className="mt-0.5 truncate text-xs text-muted">
              {d.company_name || "未指定公司"} · {new Date(d.created_at).toLocaleDateString("zh-CN")} · {countChars(d.rewritten)} 字
            </div>
          </button>
          <Button size="sm" variant="ghost" onClick={() => onOpen(d, mode === "library")}>
            {mode === "library" ? "复用" : "查看"}
          </Button>
          <button onClick={() => remove(d.id)} className="rounded-lg p-1.5 text-muted hover:bg-sakura-50 hover:text-sakura-700" aria-label="删除">
            <Trash2 className="size-4" />
          </button>
        </li>
      ))}
    </ul>
  );
}
