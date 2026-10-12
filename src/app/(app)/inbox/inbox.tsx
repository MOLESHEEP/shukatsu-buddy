"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, CircleAlert, Copy, MailOpen, Reply, Sparkles } from "lucide-react";
import { Badge, Button, Card, ErrorNote, Field, Input, Select, Textarea, cx, type Tone } from "@/components/ui";
import { EVENT_KINDS, REPLY_SCENARIOS, TEST_FORMATS, TEST_TYPES } from "@/lib/constants";
import { api, errMsg } from "@/lib/client";
import type { EmailParse, ReplyDraft } from "@/lib/llm/schemas";

const SAMPLE = `件名：【株式会社さくらテック】一次面接のご案内

王 小明 様

お世話になっております。
株式会社さくらテック 人事部の田中です。

先日はエントリーシートをご提出いただき、誠にありがとうございました。
選考の結果、ぜひ一次面接にお進みいただきたくご連絡いたしました。

日時：3月12日（水）14:00〜14:45
形式：オンライン（Zoom）
URL：https://zoom.us/j/1234567890
持ち物：履歴書（PDF）を前日までにメールでご提出ください。

お手数ですが、3月7日（金）までに本メールへご返信ください。

また、面接前に適性検査（玉手箱）の受検をお願いいたします。
受検期限：3月10日（月）23:59`;

type ParseResult = { id: number; parsed: EmailParse; match: { id: number; name: string } | null };

export function Inbox({ companies, userName }: { companies: { id: number; name: string }[]; userName: string }) {
  const [tab, setTab] = useState<"parse" | "reply">("parse");
  const [replySeed, setReplySeed] = useState<{ original: string; company: string } | null>(null);

  return (
    <div className="space-y-5">
      <div className="inline-flex rounded-full bg-paper p-1 shadow-[var(--shadow-soft)]">
        {[
          { k: "parse" as const, label: "邮件识别", icon: MailOpen },
          { k: "reply" as const, label: "回信辅助", icon: Reply },
        ].map((t) => (
          <button
            key={t.k}
            onClick={() => setTab(t.k)}
            className={cx("flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition", tab === t.k ? "bg-mint-500 text-white" : "text-muted hover:text-ink")}
          >
            <t.icon className="size-4" />
            {t.label}
          </button>
        ))}
      </div>
      {tab === "parse" ? (
        <ParseView
          companies={companies}
          onReply={(original, company) => {
            setReplySeed({ original, company });
            setTab("reply");
          }}
        />
      ) : (
        <ReplyView key={replySeed?.original ?? "empty"} seed={replySeed} userName={userName} />
      )}
    </div>
  );
}

// ---------------- Parse ----------------

type EventDraft = { keep: boolean; kind: string; title: string; starts_at: string; location: string; prep: string };

function ParseView({ companies, onReply }: { companies: { id: number; name: string }[]; onReply: (original: string, company: string) => void }) {
  const router = useRouter();
  const [raw, setRaw] = useState("");
  const [res, setRes] = useState<ParseResult | null>(null);
  const [events, setEvents] = useState<EventDraft[]>([]);
  const [keepTest, setKeepTest] = useState(true);
  const [testType, setTestType] = useState("unknown");
  const [testFormat, setTestFormat] = useState("unknown");
  const [companyId, setCompanyId] = useState<string>("new");
  const [companyName, setCompanyName] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function parse() {
    setLoading(true);
    setError(null);
    try {
      const r = await api<ParseResult>("/api/emails/parse", { body: { raw } });
      setRes(r);
      setEvents(
        r.parsed.events.map((e) => ({ keep: true, kind: e.kind, title: e.title_zh, starts_at: e.start_local.slice(0, 16), location: e.location_or_url ?? "", prep: e.prep_zh ?? "" })),
      );
      setKeepTest(!!r.parsed.test);
      setTestType(r.parsed.test?.type ?? "unknown");
      setTestFormat(r.parsed.test?.format ?? "unknown");
      setCompanyId(r.match ? String(r.match.id) : "new");
      setCompanyName(r.parsed.company_name ?? "");
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }

  async function confirm() {
    if (!res) return;
    setSaving(true);
    setError(null);
    try {
      const p = res.parsed;
      const out = await api<{ company_id: number }>(`/api/emails/${res.id}/confirm`, {
        body: {
          company_id: companyId === "new" ? null : Number(companyId),
          company_name: companyName,
          events: events.filter((e) => e.keep && e.title && e.starts_at).map(({ keep: _keep, ...e }) => e),
          test: p.test && keepTest ? { type: testType, format: testFormat, deadline: p.test.deadline_local, status: "todo", confidence: p.test.confidence } : null,
          next_action: p.needs_reply ? "回复企业邮件" : undefined,
          next_deadline: p.needs_reply ? p.reply_deadline_local : undefined,
        },
      });
      router.push(`/tracker/${out.company_id}`);
    } catch (e) {
      setError(errMsg(e));
      setSaving(false);
    }
  }

  const p = res?.parsed;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="space-y-4">
        <Field label="企业来信原文" hint={<button className="text-sakura-600 hover:underline" onClick={() => setRaw(SAMPLE)}>填入示例</button>}>
          <Textarea lang="ja" rows={16} value={raw} onChange={(e) => setRaw(e.target.value)} placeholder="把邮件全文（包括标题）粘贴到这里…" />
        </Field>
        <ErrorNote message={!res ? error : null} />
        <Button onClick={parse} loading={loading} disabled={raw.trim().length < 10} className="w-full bg-mint-500 hover:bg-mint-700">
          <Sparkles className="size-4" />
          {loading ? "AI 正在阅读…" : "识别邮件"}
        </Button>
        <p className="text-xs text-muted">邮件原文只用于为你生成结果，不做任何公开汇总。</p>
      </Card>

      {p ? (
        <div className="animate-rise space-y-4">
          <Card>
            <div className="flex items-center gap-2">
              <h2 className="font-semibold">中文摘要</h2>
              {p.needs_reply && <Badge tone="rose">需要回复{p.reply_deadline_local ? ` · ${p.reply_deadline_local.replace("T", " ")} 前` : ""}</Badge>}
            </div>
            <p className="mt-2 text-sm leading-relaxed">{p.summary_zh}</p>
            {p.required_materials.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-1.5 text-sm">
                <span className="text-muted">所需材料：</span>
                {p.required_materials.map((m) => (
                  <Badge key={m} tone="violet">
                    {m}
                  </Badge>
                ))}
              </div>
            )}
            {p.uncertain_points_zh.length > 0 && (
              <div className="mt-3 flex gap-2 rounded-xl bg-lemon-50 px-3 py-2 text-xs text-lemon-700">
                <CircleAlert className="mt-0.5 size-4 shrink-0" />
                <ul className="space-y-0.5">
                  {p.uncertain_points_zh.map((u, i) => (
                    <li key={i}>{u}</li>
                  ))}
                </ul>
              </div>
            )}
            {p.needs_reply && (
              <Button size="sm" variant="soft" className="mt-3" onClick={() => onReply(raw, p.company_name ?? "")}>
                <Reply className="size-4" /> 帮我写回信
              </Button>
            )}
          </Card>

          <Card className="space-y-4">
            <h2 className="font-semibold">确认后写入公司卡片</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="公司">
                <Select value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
                  <option value="new">＋ 新建公司</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              {companyId === "new" && (
                <Field label="公司名">
                  <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
                </Field>
              )}
            </div>

            {events.length > 0 && (
              <div className="space-y-2">
                <div className="text-sm font-medium">日程</div>
                {events.map((e, i) => (
                  <div key={i} className={cx("space-y-2 rounded-2xl border p-3 transition", e.keep ? "border-mint-100 bg-mint-50/50" : "border-line opacity-60")}>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={e.keep} onChange={(ev) => setEvents((es) => es.map((x, j) => (j === i ? { ...x, keep: ev.target.checked } : x)))} className="size-4 accent-mint-500" />
                      <Badge tone={(EVENT_KINDS[e.kind]?.tone ?? "stone") as Tone}>{EVENT_KINDS[e.kind]?.label}</Badge>
                      <Input className="py-1" value={e.title} onChange={(ev) => setEvents((es) => es.map((x, j) => (j === i ? { ...x, title: ev.target.value } : x)))} />
                    </label>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Input type="datetime-local" className="py-1.5" value={e.starts_at} onChange={(ev) => setEvents((es) => es.map((x, j) => (j === i ? { ...x, starts_at: ev.target.value } : x)))} />
                      <Input className="py-1.5" placeholder="地点 / 链接" value={e.location} onChange={(ev) => setEvents((es) => es.map((x, j) => (j === i ? { ...x, location: ev.target.value } : x)))} />
                    </div>
                    {e.prep && <p className="text-xs text-violet-700">📝 {e.prep}</p>}
                  </div>
                ))}
              </div>
            )}

            {p.test && (
              <div className={cx("space-y-2 rounded-2xl border p-3", keepTest ? "border-lemon-100 bg-lemon-50/60" : "border-line opacity-60")}>
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input type="checkbox" checked={keepTest} onChange={(e) => setKeepTest(e.target.checked)} className="size-4 accent-lemon-500" />
                  笔试记录
                  <Badge tone={p.test.confidence >= 0.7 ? "mint" : "lemon"}>置信度 {Math.round(p.test.confidence * 100)}%</Badge>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <Select value={testType} onChange={(e) => setTestType(e.target.value)}>
                    {Object.entries(TEST_TYPES).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v.label}
                      </option>
                    ))}
                  </Select>
                  <Select value={testFormat} onChange={(e) => setTestFormat(e.target.value)}>
                    {Object.entries(TEST_FORMATS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </Select>
                </div>
                <p className="text-xs text-muted">判断依据：{p.test.reason_zh}</p>
              </div>
            )}

            <ErrorNote message={error} />
            <Button onClick={confirm} loading={saving} disabled={companyId === "new" && !companyName.trim()} className="w-full">
              <Check className="size-4" /> 确认写入
            </Button>
          </Card>
        </div>
      ) : (
        <Card className="flex min-h-72 flex-col items-center justify-center bg-gradient-to-br from-mint-50/70 to-paper text-center">
          <MailOpen className="size-8 text-mint-300" />
          <p className="mt-3 font-medium">AI 会帮你提取</p>
          <ul className="mt-3 space-y-1 text-sm text-muted">
            <li>· 日期、时间、地点或线上链接</li>
            <li>· 所需材料、回复期限</li>
            <li>· 笔试类型与受检形式（SPI / 玉手箱 / TG-WEB…）</li>
          </ul>
        </Card>
      )}
    </div>
  );
}

// ---------------- Reply ----------------

function ReplyView({ seed, userName }: { seed: { original: string; company: string } | null; userName: string }) {
  const [form, setForm] = useState({
    scenario: seed ? "accept" : "accept",
    company: seed?.company ?? "",
    contact: "",
    name: userName,
    school: "",
    details: "",
    original: seed?.original ?? "",
  });
  const [draft, setDraft] = useState<ReplyDraft | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      setDraft(await api<ReplyDraft>("/api/reply", { body: form }));
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }
  async function copy() {
    if (!draft) return;
    await navigator.clipboard.writeText(`件名：${draft.subject}\n\n${draft.body}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="space-y-4">
        <Field label="场景">
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(REPLY_SCENARIOS).map(([k, v]) => (
              <button
                key={k}
                type="button"
                onClick={() => setForm((f) => ({ ...f, scenario: k }))}
                className={cx("rounded-full px-3 py-1.5 text-xs font-medium transition", form.scenario === k ? "bg-mint-500 text-white" : "bg-stone-50 text-muted hover:bg-mint-50")}
              >
                {v}
              </button>
            ))}
          </div>
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="公司">
            <Input value={form.company} onChange={set("company")} placeholder="株式会社〇〇" />
          </Field>
          <Field label="担当者">
            <Input value={form.contact} onChange={set("contact")} placeholder="人事部 田中様" />
          </Field>
          <Field label="你的名字">
            <Input value={form.name} onChange={set("name")} />
          </Field>
          <Field label="学校 / 学部">
            <Input value={form.school} onChange={set("school")} placeholder="〇〇大学 〇〇研究科" />
          </Field>
        </div>
        <Field label="补充说明" hint="中文即可">
          <Textarea rows={3} value={form.details} onChange={set("details")} placeholder="例：希望改到下周二或周四下午；辞退理由是决定入职其他公司" />
        </Field>
        <Field label="对方来信（可选）">
          <Textarea lang="ja" rows={5} value={form.original} onChange={set("original")} />
        </Field>
        <ErrorNote message={error} />
        <Button onClick={generate} loading={loading} className="w-full bg-mint-500 hover:bg-mint-700">
          <Sparkles className="size-4" /> 生成回信
        </Button>
      </Card>
      {draft ? (
        <div className="animate-rise space-y-4">
          <Card>
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold">回信草稿</h2>
              <Button size="sm" variant="soft" onClick={copy}>
                {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                {copied ? "已复制" : "复制全文"}
              </Button>
            </div>
            <p lang="ja" className="mt-3 rounded-xl bg-cream px-4 py-2 text-sm">
              <span className="text-muted">件名：</span>
              {draft.subject}
            </p>
            <pre lang="ja" className="mt-2 whitespace-pre-wrap rounded-xl bg-cream px-4 py-3 font-sans text-sm leading-relaxed">
              {draft.body}
            </pre>
          </Card>
          <Card className="bg-sky-50/60">
            <h3 className="text-sm font-semibold text-sky-700">写法要点</h3>
            <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-sky-700">
              {draft.notes_zh.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          </Card>
        </div>
      ) : (
        <Card className="flex min-h-72 flex-col items-center justify-center bg-gradient-to-br from-mint-50/70 to-paper text-center">
          <Reply className="size-8 text-mint-300" />
          <p className="mt-3 font-medium">符合商务敬语的日文回信</p>
          <p className="mt-1 max-w-xs text-sm text-muted">不确定的信息会用【　】留空，请自己填写后再发送。</p>
        </Card>
      )}
    </div>
  );
}
