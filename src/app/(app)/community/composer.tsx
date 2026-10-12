"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, CircleAlert, Lightbulb, ShieldAlert, Sparkles, Star, WandSparkles } from "lucide-react";
import { Badge, Button, Card, ErrorNote, Field, Input, Select, Textarea, cx } from "@/components/ui";
import { PostBody, PostMeta, authorLabel } from "@/components/post-view";
import { EMPLOYMENT_TYPES, INTERVIEW_STAGES, POST_KINDS, POST_RESULTS, type Post, type PostKind } from "@/lib/community";
import { api, errMsg } from "@/lib/client";

export type ComposerInitial = {
  id?: number;
  status?: "draft" | "published" | "hidden";
  kind: PostKind;
  company_name: string;
  industry: string;
  role: string;
  occurred_on: string;
  ended_on: string | null;
  grad_year: number | null;
  stage: string;
  result: string;
  employment_type: string;
  rating: number | null;
  title: string;
  body: string;
  tags: string[];
  anonymous: boolean;
  notes: string;
};

type Step = "describe" | "edit" | "preview";

const NOTE_HINTS: Record<PostKind, string> = {
  interview:
    "随便写，不用在意语句通顺，中文日文混着写也可以。\n例：线上一面，面试官两个人，一个人事一个现场的。先1分钟自我介绍，然后问了为什么来日本、ガクチカ里最难的地方、为什么选IT。逆質問问了新人培训。整体挺轻松的，大概30分钟，一周后通过了。",
  work:
    "随便写，想到什么写什么。\n例：新卒进去做后端开发，团队8个人，前辈很照顾。平时7点能走，发版前会加班。工资一般但住房补贴不错。公司帮忙办签证，外国人不少，日语要求商务水平。第二年开始可以自己负责项目，成长挺快。",
};

export function Composer({
  initial,
  profileGradYear,
  ai,
}: {
  initial: ComposerInitial;
  profileGradYear: number | null;
  ai: { allowed: boolean; left: number | null; userId: number };
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(initial.id ? "edit" : "describe");
  const [f, setF] = useState<ComposerInitial>({ ...initial, grad_year: initial.grad_year ?? profileGradYear });
  const [present, setPresent] = useState(initial.kind === "work" ? !initial.ended_on : true);
  const [tagText, setTagText] = useState(initial.tags.join("、"));
  const [aiHints, setAiHints] = useState<{ questions: string[]; privacy: string[] } | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState<"draft" | "save" | "publish" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof ComposerInitial>(k: K, v: ComposerInitial[K]) => setF((s) => ({ ...s, [k]: v }));
  const tags = tagText
    .split(/[、,，#\s]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 8);
  const payload = () => ({
    ...f,
    ended_on: f.kind === "work" && !present ? f.ended_on || null : null,
    tags,
    rating: f.kind === "work" ? f.rating : null,
  });
  const metaReady = f.company_name.trim() && /^\d{4}-\d{2}$/.test(f.occurred_on) && (f.kind === "interview" || present || /^\d{4}-\d{2}$/.test(f.ended_on ?? ""));

  async function generate() {
    if (f.title || f.body) {
      if (!confirm("重新整理会覆盖当前的标题和正文，继续吗？")) return;
    }
    setBusy("draft");
    setError(null);
    try {
      const p = payload();
      const d = await api<{ title: string; body: string; tags: string[]; questions_zh: string[]; privacy_warnings_zh: string[] }>("/api/posts/draft", {
        body: { kind: p.kind, company_name: p.company_name, role: p.role, occurred_on: p.occurred_on, ended_on: p.ended_on, grad_year: p.grad_year, stage: p.stage, result: p.result, employment_type: p.employment_type, notes: p.notes },
      });
      setF((s) => ({ ...s, title: d.title, body: d.body }));
      setTagText(d.tags.join("、"));
      setAiHints({ questions: d.questions_zh, privacy: d.privacy_warnings_zh });
      setStep("edit");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(null);
    }
  }

  /** Saves without publishing; returns the post id. */
  async function persist(): Promise<number> {
    if (f.id) {
      await api(`/api/posts/${f.id}`, { method: "PATCH", body: { post: payload(), action: "save" } });
      return f.id;
    }
    const { id } = await api<{ id: number }>("/api/posts", { body: payload() });
    setF((s) => ({ ...s, id }));
    return id;
  }

  async function saveDraft() {
    setBusy("save");
    setError(null);
    try {
      const id = await persist();
      router.push(`/community/${id}`);
      router.refresh();
    } catch (e) {
      setError(errMsg(e));
      setBusy(null);
    }
  }

  async function publish() {
    setBusy("publish");
    setError(null);
    try {
      const id = f.id ?? (await persist());
      await api(`/api/posts/${id}`, { method: "PATCH", body: { post: payload(), action: "publish", confirmed } });
      router.push(`/community/${id}`);
      router.refresh();
    } catch (e) {
      setError(errMsg(e));
      setBusy(null);
    }
  }

  const steps: { key: Step; label: string }[] = [
    { key: "describe", label: "描述经历" },
    { key: "edit", label: "编辑" },
    { key: "preview", label: "预览确认" },
  ];
  const stepIndex = steps.findIndex((s) => s.key === step);

  const previewPost: Post = {
    ...(payload() as Omit<ComposerInitial, "id" | "status" | "notes">),
    id: f.id ?? 0,
    user_id: 0,
    status: "published",
    created_at: "",
    updated_at: "",
    published_at: null,
    author: "",
    votes: 0,
    voted: false,
  } as Post;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {/* Stepper */}
      <ol className="flex items-center gap-2 text-sm">
        {steps.map((s, i) => (
          <li key={s.key} className="flex items-center gap-2">
            <span
              className={cx(
                "flex size-7 items-center justify-center rounded-full text-xs font-bold",
                i < stepIndex ? "bg-mint-100 text-mint-700" : i === stepIndex ? "bg-sakura-500 text-white" : "bg-paper text-muted ring-1 ring-line",
              )}
            >
              {i < stepIndex ? <Check className="size-3.5" /> : i + 1}
            </span>
            <span className={cx(i === stepIndex ? "font-medium" : "text-muted")}>{s.label}</span>
            {i < steps.length - 1 && <span className="mx-1 h-px w-6 bg-line sm:w-10" />}
          </li>
        ))}
      </ol>

      {step === "describe" && (
        <>
          <Card className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(POST_KINDS) as PostKind[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => set("kind", k)}
                  className={cx(
                    "rounded-2xl border-2 p-4 text-left transition",
                    f.kind === k ? "border-sakura-300 bg-sakura-50" : "border-line bg-paper hover:border-sakura-100",
                  )}
                >
                  <div className="text-2xl">{POST_KINDS[k].emoji}</div>
                  <div className="mt-1 font-semibold">{POST_KINDS[k].label}</div>
                  <div className="text-xs text-muted">{k === "interview" ? "说明会、笔试、面试的经历" : "入职后的真实工作感受"}</div>
                </button>
              ))}
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="公司" className="sm:col-span-1">
                <Input value={f.company_name} onChange={(e) => set("company_name", e.target.value)} placeholder="株式会社〇〇" />
              </Field>
              <Field label="职种 / 岗位">
                <Input value={f.role} onChange={(e) => set("role", e.target.value)} placeholder="SE / 営業 / 総合職…" />
              </Field>
              <Field label="行业">
                <Input value={f.industry} onChange={(e) => set("industry", e.target.value)} placeholder="IT / 商社 / 金融…" />
              </Field>
            </div>

            <div className="rounded-2xl bg-sky-50/70 p-4">
              <p className="mb-3 flex items-center gap-1.5 text-sm font-medium text-sky-700">🕒 时间（必填，帮助读者判断经验是否过时）</p>
              {f.kind === "interview" ? (
                <div className="grid gap-3 sm:grid-cols-4">
                  <Field label="面试时间">
                    <Input type="month" value={f.occurred_on} onChange={(e) => set("occurred_on", e.target.value)} required />
                  </Field>
                  <Field label="当时是几届" hint="毕业年份">
                    <Input type="number" placeholder="2028" value={f.grad_year ?? ""} onChange={(e) => set("grad_year", e.target.value ? Number(e.target.value) : null)} />
                  </Field>
                  <Field label="阶段">
                    <Select value={f.stage} onChange={(e) => set("stage", e.target.value)}>
                      <option value="">—</option>
                      {INTERVIEW_STAGES.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="结果">
                    <Select value={f.result} onChange={(e) => set("result", e.target.value)}>
                      {Object.entries(POST_RESULTS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-4">
                  <Field label="入职时间">
                    <Input type="month" value={f.occurred_on} onChange={(e) => set("occurred_on", e.target.value)} required />
                  </Field>
                  <Field label="离职时间" hint={<label className="flex items-center gap-1"><input type="checkbox" checked={present} onChange={(e) => setPresent(e.target.checked)} className="accent-sakura-500" />至今在职</label>}>
                    <Input type="month" value={f.ended_on ?? ""} disabled={present} onChange={(e) => set("ended_on", e.target.value)} />
                  </Field>
                  <Field label="雇佣形式">
                    <Select value={f.employment_type} onChange={(e) => set("employment_type", e.target.value)}>
                      <option value="">—</option>
                      {EMPLOYMENT_TYPES.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="总体评分">
                    <div className="flex h-[42px] items-center gap-1">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <button key={i} type="button" onClick={() => set("rating", f.rating === i ? null : i)} aria-label={`${i} 星`}>
                          <Star className={cx("size-6 transition", f.rating && i <= f.rating ? "fill-lemon-500 text-lemon-500" : "text-stone-100 hover:text-lemon-300")} />
                        </button>
                      ))}
                    </div>
                  </Field>
                </div>
              )}
            </div>

            <Field label="大致说说你的经历" hint="AI 只会整理你写的内容，不会编造">
              <Textarea rows={9} value={f.notes} onChange={(e) => set("notes", e.target.value)} placeholder={NOTE_HINTS[f.kind]} />
            </Field>

            <ErrorNote message={error} />
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="ghost" disabled={!metaReady} onClick={() => setStep("edit")}>
                跳过，自己写
              </Button>
              <Button onClick={generate} loading={busy === "draft"} disabled={!metaReady || f.notes.trim().length < 15 || !ai.allowed || ai.left === 0}>
                <WandSparkles className="size-4" />
                {busy === "draft" ? "AI 正在整理…" : ai.left === 0 ? "今天的 AI 整理次数已用完" : `AI 帮我整理${ai.left != null ? `（今天剩 ${ai.left} 次）` : ""}`}
              </Button>
            </div>
            {!metaReady && <p className="text-right text-xs text-muted">请先填写公司和时间</p>}
            {!ai.allowed && (
              <p className="rounded-xl bg-lemon-50 px-3.5 py-2.5 text-xs text-lemon-700">
                AI 整理需要管理员开通（你的用户 ID：<b className="font-mono">{ai.userId}</b>）。现在可以点「跳过，自己写」直接撰写。
              </p>
            )}
          </Card>
        </>
      )}

      {step === "edit" && (
        <>
          {aiHints && (aiHints.privacy.length > 0 || aiHints.questions.length > 0) && (
            <div className="grid gap-3 sm:grid-cols-2">
              {aiHints.privacy.length > 0 && (
                <div className="rounded-2xl bg-sakura-50 p-4 text-sm text-sakura-700">
                  <p className="flex items-center gap-1.5 font-medium">
                    <ShieldAlert className="size-4" /> 隐私提醒
                  </p>
                  <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-xs leading-relaxed">
                    {aiHints.privacy.map((p, i) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ul>
                </div>
              )}
              {aiHints.questions.length > 0 && (
                <div className="rounded-2xl bg-violet-50 p-4 text-sm text-violet-700">
                  <p className="flex items-center gap-1.5 font-medium">
                    <Lightbulb className="size-4" /> 补充这些会更有参考价值
                  </p>
                  <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-xs leading-relaxed">
                    {aiHints.questions.map((q, i) => (
                      <li key={i}>{q}</li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs opacity-80">可以直接在正文里补充，或回到上一步补充描述后重新整理。</p>
                </div>
              )}
            </div>
          )}

          <Card className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold">编辑内容</h2>
              <Badge tone="sky">{POST_KINDS[f.kind].label} · {f.company_name}</Badge>
            </div>
            <Field label="标题">
              <Input value={f.title} maxLength={80} onChange={(e) => set("title", e.target.value)} placeholder="一句话概括，例：さくらテック一面：重视为什么来日本" />
            </Field>
            <Field label="正文" hint="「## 」开头是小标题，「- 」开头是要点">
              <Textarea rows={18} value={f.body} onChange={(e) => set("body", e.target.value)} className="font-[inherit] leading-7" placeholder={"## 面试形式\n线上 30 分钟…\n\n## 被问到的问题\n- 自己紹介\n- なぜ日本で働きたいのか"} />
            </Field>
            <Field label="标签" hint="用顿号或空格分隔，最多 8 个">
              <Input value={tagText} onChange={(e) => setTagText(e.target.value)} placeholder="线上面试、留学生、IT" />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={f.anonymous} onChange={(e) => set("anonymous", e.target.checked)} className="size-4 accent-sakura-500" />
              匿名发布（推荐）
              <span className="text-xs text-muted">不勾选会显示你的名字</span>
            </label>
            <ErrorNote message={error} />
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
              <Button variant="ghost" onClick={() => setStep("describe")}>
                <ArrowLeft className="size-4" /> {f.notes ? "回到描述 / 重新整理" : "修改基本信息"}
              </Button>
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                {f.status === "hidden" && <span className="self-center text-xs text-sakura-700">已被管理员隐藏，只能保存修改</span>}
                {f.status !== "published" && (
                  <Button variant="soft" onClick={saveDraft} loading={busy === "save"} disabled={!f.title.trim() || f.body.trim().length < 20}>
                    保存草稿
                  </Button>
                )}
                <Button
                  onClick={() => {
                    setConfirmed(false);
                    setStep("preview");
                    window.scrollTo({ top: 0 });
                  }}
                  disabled={!f.title.trim() || f.body.trim().length < 20 || f.status === "hidden"}
                >
                  预览{f.status === "published" ? "并更新" : "并发布"} →
                </Button>
              </div>
            </div>
          </Card>
        </>
      )}

      {step === "preview" && (
        <>
          <div className="flex items-center gap-2 rounded-2xl bg-lemon-50 px-4 py-3 text-sm text-lemon-700">
            <CircleAlert className="size-4 shrink-0" />
            这是其他用户将看到的样子。请逐字确认后再发布。
          </div>
          <Card className="p-6 sm:p-8">
            <div className="text-sm text-muted">
              <span className="font-semibold text-ink">{f.company_name}</span>
              {f.role && ` · ${f.role}`}
              {f.industry && ` · ${f.industry}`}
            </div>
            <h1 className="mt-1.5 text-2xl font-bold leading-snug tracking-tight">{f.title}</h1>
            <div className="mt-3">
              <PostMeta post={previewPost} />
            </div>
            <div className="mt-6 border-t border-line pt-6">
              <PostBody body={f.body} />
            </div>
            {tags.length > 0 && (
              <div className="mt-6 flex flex-wrap gap-1.5">
                {tags.map((t) => (
                  <span key={t} className="rounded-full bg-stone-50 px-2.5 py-1 text-xs text-muted">
                    #{t}
                  </span>
                ))}
              </div>
            )}
            <p className="mt-6 border-t border-line pt-4 text-xs text-muted">作者显示为：{authorLabel({ anonymous: f.anonymous, author: "你的名字" })}</p>
          </Card>

          <Card className="space-y-4">
            <label className="flex items-start gap-2.5 text-sm">
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-sakura-500" />
              <span>
                我已检查以上内容：内容是我的真实经历，<b>不包含</b>面试官或同事的姓名、联系方式，以及公司的机密信息。
              </span>
            </label>
            <ErrorNote message={error} />
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
              <Button variant="ghost" onClick={() => setStep("edit")}>
                <ArrowLeft className="size-4" /> 返回修改
              </Button>
              <Button onClick={publish} disabled={!confirmed} loading={busy === "publish"}>
                <Sparkles className="size-4" /> 确认{f.status === "published" ? "更新" : "发布"}
              </Button>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
