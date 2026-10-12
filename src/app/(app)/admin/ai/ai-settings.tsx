"use client";

import { useState } from "react";
import { ChevronDown, CircleCheck, CircleDashed, ExternalLink, KeyRound, List, PlugZap, X } from "lucide-react";
import { Badge, Button, Card, ErrorNote, Field, Input, Select, cx } from "@/components/ui";
import { api, errMsg } from "@/lib/client";
import type { LlmAdminView } from "@/lib/admin";

type ProviderView = LlmAdminView["providers"][number];

export function AiSettings({ initial }: { initial: LlmAdminView }) {
  const [view, setView] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  async function save(body: Record<string, unknown>, what: string) {
    setError(null);
    try {
      setView(await api<LlmAdminView>("/api/admin/llm", { method: "PUT", body }));
      setSaved(what);
      setTimeout(() => setSaved(null), 2000);
      return true;
    } catch (e) {
      setError(errMsg(e));
      return false;
    }
  }

  return (
    <div className="space-y-6">
      <ErrorNote message={error} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Routing view={view} onSave={save} saved={saved === "routing"} />
        <Policy view={view} onSave={save} saved={saved === "policy"} />
      </div>
      <div>
        <h2 className="mb-1 font-semibold">AI 服务</h2>
        <p className="mb-3 text-xs text-muted">
          在这里填写的 API Key 加密保存在数据库中（用 AUTH_SECRET 派生的密钥），优先于服务器 .env；页面上只显示掩码。留空的项会使用 .env 或内置默认值。
        </p>
        <div className="grid gap-3 lg:grid-cols-2">
          {view.providers.map((p) => (
            <ProviderCard key={p.id} p={p} onSave={save} />
          ))}
        </div>
      </div>
    </div>
  );
}

function Routing({ view, onSave, saved }: { view: LlmAdminView; onSave: (b: Record<string, unknown>, w: string) => Promise<boolean>; saved: boolean }) {
  const [primary, setPrimary] = useState<string>(view.primary ?? "");
  const [fallback, setFallback] = useState<string[]>(view.fallback ?? []);
  const [followEnvFallback, setFollowEnvFallback] = useState(view.fallback == null);
  const configured = view.providers.filter((p) => p.configured);
  const active = view.providers.find((p) => p.role === "primary");

  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">使用哪个模型</h2>
        {active ? <Badge tone="mint">当前：{active.label} · {active.model}</Badge> : <Badge tone="violet">当前：演示模式</Badge>}
      </div>
      <Field label="主力 AI">
        <Select value={primary} onChange={(e) => setPrimary(e.target.value)}>
          <option value="">跟随服务器 .env（{view.envPrimary}）</option>
          <option value="auto">自动：第一个已配置的服务</option>
          {view.providers.map((p) => (
            <option key={p.id} value={p.id} disabled={!p.configured}>
              {p.label}
              {p.configured ? ` · ${p.model}` : "（未配置）"}
            </option>
          ))}
          <option value="mock">演示模式（不调用任何 AI）</option>
        </Select>
      </Field>
      <div>
        <div className="flex items-center justify-between text-sm font-medium">
          备用 AI（主力出错时按顺序切换）
          <label className="flex items-center gap-1 text-xs font-normal text-muted">
            <input type="checkbox" checked={followEnvFallback} onChange={(e) => setFollowEnvFallback(e.target.checked)} className="accent-sakura-500" />
            跟随 .env{view.envFallback ? `（${view.envFallback}）` : ""}
          </label>
        </div>
        {!followEnvFallback && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {configured.length === 0 && <span className="text-xs text-muted">先配置至少一个服务</span>}
            {configured
              .filter((p) => p.id !== primary)
              .map((p) => {
                const idx = fallback.indexOf(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setFallback((f) => (idx >= 0 ? f.filter((x) => x !== p.id) : [...f, p.id]))}
                    className={cx("rounded-full px-3 py-1.5 text-xs font-medium transition", idx >= 0 ? "bg-sky-500 text-white" : "bg-stone-50 text-muted hover:bg-sky-50")}
                  >
                    {idx >= 0 && `${idx + 1}. `}
                    {p.label}
                  </button>
                );
              })}
          </div>
        )}
      </div>
      <Button onClick={() => onSave({ primary: primary || null, fallback: followEnvFallback ? null : fallback }, "routing")}>{saved ? "已保存 ✓ 立即生效" : "保存"}</Button>
    </Card>
  );
}

function Policy({ view, onSave, saved }: { view: LlmAdminView; onSave: (b: Record<string, unknown>, w: string) => Promise<boolean>; saved: boolean }) {
  const [aiDefault, setAiDefault] = useState(view.aiDefaultEnabled);
  const [limits, setLimits] = useState({ es: String(view.limits.es), email: String(view.limits.email), post: String(view.limits.post) });
  return (
    <Card className="space-y-4">
      <h2 className="font-semibold">AI 开通与每日额度</h2>
      <Field label="新用户默认能否使用 AI">
        <div className="grid grid-cols-2 gap-2">
          {[
            { v: false, label: "关闭（由管理员逐个开通）" },
            { v: true, label: "开启（所有人可用）" },
          ].map((o) => (
            <button
              key={String(o.v)}
              type="button"
              onClick={() => setAiDefault(o.v)}
              className={cx("rounded-xl border px-3 py-2.5 text-sm transition", aiDefault === o.v ? "border-sakura-300 bg-sakura-50 font-medium text-sakura-700" : "border-line text-muted hover:bg-stone-50")}
            >
              {o.label}
            </button>
          ))}
        </div>
      </Field>
      <p className="-mt-2 text-xs text-muted">单个用户的开关在「用户」页设置，优先于这里的默认值。不使用 AI 的功能（手动写 ES、选考追踪、自己写分享）不受影响。</p>
      <div>
        <p className="text-sm font-medium">每人每天默认次数</p>
        <div className="mt-1.5 grid grid-cols-3 gap-2">
          {(
            [
              ["es", "ES 添削"],
              ["email", "邮件助手"],
              ["post", "经验整理"],
            ] as const
          ).map(([k, label]) => (
            <label key={k} className="text-xs text-muted">
              {label}
              <Input type="number" min={0} className="mt-1" value={limits[k]} onChange={(e) => setLimits((s) => ({ ...s, [k]: e.target.value }))} />
            </label>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-muted">邮件助手包括「邮件识别」和「回信辅助」。每天 0 点（日本时间）重置，失败的调用不计数。可在「用户」页为个别用户单独设置。</p>
      </div>
      <Button
        onClick={() =>
          onSave({ aiDefaultEnabled: aiDefault, limits: { es: Number(limits.es) || 0, email: Number(limits.email) || 0, post: Number(limits.post) || 0 } }, "policy")
        }
      >
        {saved ? "已保存 ✓" : "保存"}
      </Button>
    </Card>
  );
}

function ProviderCard({ p, onSave }: { p: ProviderView; onSave: (b: Record<string, unknown>, w: string) => Promise<boolean> }) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [model, setModel] = useState(p.modelOverride);
  const [baseUrl, setBaseUrl] = useState(p.baseUrlOverride);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [models, setModels] = useState<string[] | null>(null);

  async function saveProvider(extra: Record<string, unknown> = {}) {
    setBusy("save");
    const ok = await onSave({ providers: { [p.id]: { model, baseUrl, ...(key ? { apiKey: key } : {}), ...extra } } }, p.id);
    if (ok) {
      setKey("");
      setResult({ kind: "ok", text: "已保存" });
    }
    setBusy(null);
  }
  async function run(action: "test" | "models") {
    setBusy(action);
    setResult(null);
    try {
      if (action === "test") {
        const r = await api<{ ms: number; reply: string; model: string }>("/api/admin/llm", { body: { action, provider: p.id } });
        setResult({ kind: "ok", text: `连接成功 · ${r.model} · ${(r.ms / 1000).toFixed(1)} 秒 · 「${r.reply}」` });
      } else {
        setModels((await api<{ models: string[] }>("/api/admin/llm", { body: { action, provider: p.id } })).models);
      }
    } catch (e) {
      setResult({ kind: "err", text: errMsg(e) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={cx("rounded-2xl border bg-paper p-4 shadow-[var(--shadow-soft)]", p.role === "primary" ? "border-sakura-100" : "border-line")}>
      <div className="flex items-start justify-between gap-2">
        <button onClick={() => setOpen((o) => !o)} className="min-w-0 flex-1 text-left">
          <div className="flex flex-wrap items-center gap-1.5">
            {p.configured ? <CircleCheck className="size-4 text-mint-500" /> : <CircleDashed className="size-4 text-muted" />}
            <span className="font-medium">{p.label}</span>
            <span className="text-xs text-muted">{p.vendor}</span>
            {p.role === "primary" && <Badge tone="sakura">主力</Badge>}
            {p.role === "fallback" && <Badge tone="sky">备用</Badge>}
          </div>
          <div className="mt-0.5 truncate text-xs text-muted">
            {p.configured ? `模型 ${p.model}` : p.missing}
            {p.keyMasked && ` · Key ${p.keyMasked}（${p.keySource === "admin" ? "后台设置" : ".env"}）`}
          </div>
        </button>
        <div className="flex shrink-0 items-center gap-1">
          {p.configured && (
            <Button size="sm" variant="soft" onClick={() => run("test")} loading={busy === "test"} disabled={!!busy}>
              <PlugZap className="size-3.5" /> 测试
            </Button>
          )}
          <button onClick={() => setOpen((o) => !o)} className="rounded-lg p-1.5 text-muted hover:bg-stone-50" aria-label="设置">
            <ChevronDown className={cx("size-4 transition", open && "rotate-180")} />
          </button>
        </div>
      </div>

      {open && (
        <div className="mt-3 space-y-3 border-t border-line pt-3">
          {p.note && <p className="rounded-lg bg-lemon-50 px-2.5 py-1.5 text-xs text-lemon-700">{p.note}</p>}
          {p.id !== "ollama" && (
            <Field
              label="API Key"
              hint={
                p.consoleUrl ? (
                  <a href={p.consoleUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-sky-700 hover:underline">
                    获取 Key <ExternalLink className="size-3" />
                  </a>
                ) : undefined
              }
            >
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <KeyRound className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
                  <Input
                    type="password"
                    autoComplete="off"
                    className="pl-9 font-mono text-xs"
                    value={key}
                    onChange={(e) => setKey(e.target.value)}
                    placeholder={p.keyMasked ? `已设置 ${p.keyMasked}，留空保持不变` : `粘贴 API Key（或在 .env 设置 ${p.keyEnv}）`}
                  />
                </div>
                {p.keySource === "admin" && (
                  <Button size="sm" variant="ghost" title="删除后台保存的 Key，改用 .env" onClick={() => saveProvider({ apiKey: null })}>
                    <X className="size-3.5" />
                  </Button>
                )}
              </div>
            </Field>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="模型" hint={p.defaultModel ? `默认 ${p.defaultModel}` : "必填"}>
              <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder={p.model ?? "模型 ID"} />
            </Field>
            <Field label="接口地址" hint="一般不用改">
              <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder={p.defaultBaseUrl || "https://…/v1"} />
            </Field>
          </div>
          {models && (
            <div className="rounded-lg bg-stone-50 px-2.5 py-2 text-xs">
              <p className="text-muted">这个 Key 可用的模型 {models.length} 个，点击即可选用：</p>
              <div className="scrollbar-thin mt-1.5 flex max-h-36 flex-wrap gap-1 overflow-y-auto">
                {models.map((m) => (
                  <button key={m} onClick={() => setModel(m)} className={cx("rounded px-1.5 py-0.5 font-mono", m === (model || p.model) ? "bg-mint-100 text-mint-700" : "bg-paper hover:bg-sky-50")}>
                    {m}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => saveProvider()} loading={busy === "save"}>
              保存
            </Button>
            <Button size="sm" variant="ghost" onClick={() => run("models")} loading={busy === "models"} disabled={!!busy}>
              <List className="size-3.5" /> 查看可用模型
            </Button>
          </div>
        </div>
      )}
      {result && <p className={cx("mt-2 rounded-lg px-2.5 py-1.5 text-xs", result.kind === "ok" ? "bg-mint-50 text-mint-700" : "bg-sakura-50 text-sakura-700")}>{result.text}</p>}
    </div>
  );
}
