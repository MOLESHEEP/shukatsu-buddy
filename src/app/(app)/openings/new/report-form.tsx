"use client";

import Link from "next/link";
import { useState } from "react";
import { Globe, Lock } from "lucide-react";
import { Button, Card, ErrorNote, Field, Input, Textarea, cx } from "@/components/ui";
import { api, errMsg } from "@/lib/client";
import { toDateInput, type Opening } from "@/lib/openings-shared";

type Result = { visibility: "public" | "private"; reportId: number | null; companyId: number | null };

/** A date input plus an optional time; empty time = whole day. */
export function DateTime({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [date, time = ""] = value.split("T");
  const set = (d: string, t: string) => onChange(d ? (t ? `${d}T${t}` : d) : "");
  return (
    <div className="flex gap-2">
      <Input type="date" value={date} onChange={(e) => set(e.target.value, time)} className="min-w-0 flex-1" />
      <Input type="time" value={time} onChange={(e) => set(date, e.target.value)} disabled={!date} className="w-32" aria-label="时间（可不填）" />
    </div>
  );
}

export function ReportForm({ target, defaultCompany, defaultGradYear }: { target: Opening | null; defaultCompany: string; defaultGradYear: number | null }) {
  const [f, setF] = useState({
    company_name: target?.company_name ?? defaultCompany,
    grad_year: target ? (target.grad_year ? String(target.grad_year) : "") : defaultGradYear ? String(defaultGradYear) : "",
    opens_at: toDateInput(target?.opens_at ?? null),
    deadline: toDateInput(target?.deadline ?? null),
    url: target?.url ?? "",
    note: target?.note ?? "",
  });
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [anonymous, setAnonymous] = useState(true);
  const [addToTracker, setAddToTracker] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Result | null>(null);
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<Result>("/api/openings", {
        body: {
          ...f,
          grad_year: f.grad_year ? Number(f.grad_year) : null,
          visibility,
          anonymous,
          add_to_tracker: visibility === "private" || addToTracker,
          opening_id: target?.id ?? null,
        },
      });
      setDone(r);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <Card className="space-y-3 text-center">
        <p className="text-3xl">{done.visibility === "public" ? "🙌" : "📌"}</p>
        <p className="font-semibold">{done.visibility === "public" ? "已提交，等待管理员审核" : "已记到你的选考追踪"}</p>
        <p className="text-sm text-muted">
          {done.visibility === "public"
            ? "审核通过后会通知关注这家公司的同学，你也会收到通知并获得 1 point。"
            : "这条信息只有你自己能看到，开放和截止时间已经加到公司卡片和日历订阅里。"}
        </p>
        <div className="flex flex-wrap justify-center gap-3 text-sm">
          {done.companyId && (
            <Link href={`/tracker/${done.companyId}`} className="font-medium text-sakura-600 hover:underline">
              查看公司卡片
            </Link>
          )}
          <Link href={done.visibility === "public" ? "/openings?tab=mine" : "/openings"} className="font-medium text-sakura-600 hover:underline">
            {done.visibility === "public" ? "我的上报" : "返回选考开放"}
          </Link>
        </div>
      </Card>
    );
  }

  const options = [
    { k: "public" as const, icon: Globe, title: "公开", desc: "审核通过后通知关注这家公司的同学，+1 point" },
    { k: "private" as const, icon: Lock, title: "仅自己可见", desc: "不公开、不审核，只写进我的选考追踪" },
  ];

  return (
    <form onSubmit={submit} className="space-y-5">
      <Card className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
          <Field label="公司">
            <Input required maxLength={100} value={f.company_name} onChange={(e) => set("company_name")(e.target.value)} placeholder="株式会社〇〇" />
          </Field>
          <Field label="届" hint="可不填">
            <Input type="number" min={2000} max={2100} value={f.grad_year} onChange={(e) => set("grad_year")(e.target.value)} placeholder="2028" />
          </Field>
        </div>
        <Field label="エントリー开放" hint="时间可不填">
          <DateTime value={f.opens_at} onChange={set("opens_at")} />
        </Field>
        <Field label="エントリー截止" hint="开放和截止至少填一个">
          <DateTime value={f.deadline} onChange={set("deadline")} />
        </Field>
        <Field label="采用页 / エントリー链接" hint="有官方链接审核更快">
          <Input type="url" value={f.url} onChange={(e) => set("url")(e.target.value)} placeholder="https://" maxLength={500} />
        </Field>
        <Field label="补充说明" hint="可不填">
          <Textarea rows={2} maxLength={500} value={f.note} onChange={(e) => set("note")(e.target.value)} placeholder="例：需先在マイページ登録；理系・文系分开受付" />
        </Field>
      </Card>

      <Card className="space-y-3">
        <p className="text-sm font-medium">谁能看到</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {options.map((o) => (
            <button
              key={o.k}
              type="button"
              onClick={() => setVisibility(o.k)}
              className={cx(
                "rounded-2xl border p-3 text-left transition",
                visibility === o.k ? "border-sakura-300 bg-sakura-50/60 ring-4 ring-sakura-50" : "border-line hover:bg-stone-50",
              )}
            >
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <o.icon className="size-4" /> {o.title}
              </span>
              <span className="mt-0.5 block text-xs text-muted">{o.desc}</span>
            </button>
          ))}
        </div>
        {visibility === "public" && (
          <div className="space-y-2 pt-1 text-sm">
            <label className="flex items-start gap-2">
              <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} className="mt-0.5 accent-sakura-500" />
              <span>
                匿名上报<span className="text-muted">（推荐。只有管理员能看到是谁上报的；取消勾选会显示你的昵称）</span>
              </span>
            </label>
            <label className="flex items-start gap-2">
              <input type="checkbox" checked={addToTracker} onChange={(e) => setAddToTracker(e.target.checked)} className="mt-0.5 accent-sakura-500" />
              <span>同时加入我的选考追踪</span>
            </label>
          </div>
        )}
      </Card>

      <ErrorNote message={error} />
      <div className="flex justify-end">
        <Button type="submit" loading={busy}>
          {visibility === "public" ? "提交审核" : "记到我的选考追踪"}
        </Button>
      </div>
    </form>
  );
}
