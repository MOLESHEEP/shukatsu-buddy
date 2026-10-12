"use client";

import { useState } from "react";
import { CircleCheck, CircleDashed, ExternalLink, List, PlugZap } from "lucide-react";
import { Badge, Button, Card, cx } from "@/components/ui";
import { api, errMsg } from "@/lib/client";

export type ProviderStatus = {
  id: string;
  label: string;
  vendor: string;
  model: string | null;
  baseUrl: string;
  configured: boolean;
  missing: string | null;
  keyEnv: string;
  note?: string;
  consoleUrl: string;
  role: "primary" | "fallback" | null;
};

type Result = { kind: "ok"; text: string } | { kind: "err"; text: string } | { kind: "models"; models: string[] };

export function AiProviders({ providers, demo }: { providers: ProviderStatus[]; demo: boolean }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, Result>>({});
  const [showAll, setShowAll] = useState(false);

  async function test(id: string) {
    setBusy(id + ":test");
    try {
      const r = await api<{ ms: number; reply: string; model: string }>("/api/llm", { body: { provider: id } });
      setResults((s) => ({ ...s, [id]: { kind: "ok", text: `连接成功 · ${r.model} · ${(r.ms / 1000).toFixed(1)} 秒 · 「${r.reply}」` } }));
    } catch (e) {
      setResults((s) => ({ ...s, [id]: { kind: "err", text: errMsg(e) } }));
    } finally {
      setBusy(null);
    }
  }
  async function models(id: string) {
    setBusy(id + ":models");
    try {
      const r = await api<{ models: string[] }>(`/api/llm?models=${id}`);
      setResults((s) => ({ ...s, [id]: { kind: "models", models: r.models } }));
    } catch (e) {
      setResults((s) => ({ ...s, [id]: { kind: "err", text: errMsg(e) } }));
    } finally {
      setBusy(null);
    }
  }

  const visible = showAll ? providers : providers.filter((p) => p.configured || p.role);

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">🤖 AI 引擎</h2>
        {demo && <Badge tone="violet">演示模式</Badge>}
      </div>
      <p className="text-xs text-muted">
        支持 Claude、ChatGPT、DeepSeek、Kimi、通义千问、智谱 GLM、Gemini、豆包、Ollama 及任意 OpenAI 兼容服务。由服务器的 <code>.env</code> 配置（
        <code>LLM_PROVIDER</code> 选主力，<code>LLM_FALLBACK</code> 设备用）。
      </p>

      {visible.length === 0 && <p className="rounded-xl bg-stone-50 px-3 py-2 text-sm text-muted">还没有配置任何 AI 服务。</p>}

      <ul className="space-y-2">
        {visible.map((p) => {
          const r = results[p.id];
          return (
            <li key={p.id} className={cx("rounded-2xl border p-3", p.role === "primary" ? "border-sakura-100 bg-sakura-50/50" : "border-line")}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {p.configured ? <CircleCheck className="size-4 text-mint-500" /> : <CircleDashed className="size-4 text-muted" />}
                    <span className="font-medium">{p.label}</span>
                    <span className="text-xs text-muted">{p.vendor}</span>
                    {p.role === "primary" && <Badge tone="sakura">主力</Badge>}
                    {p.role === "fallback" && <Badge tone="sky">备用</Badge>}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-muted">
                    {p.configured ? `模型：${p.model}` : p.missing}
                    {p.consoleUrl && (
                      <a href={p.consoleUrl} target="_blank" rel="noreferrer" className="ml-2 inline-flex items-center gap-0.5 text-sky-700 hover:underline">
                        {p.id === "ollama" ? "模型库" : "获取 Key"} <ExternalLink className="size-3" />
                      </a>
                    )}
                  </div>
                </div>
                {p.configured && (
                  <div className="flex shrink-0 gap-1">
                    <Button size="sm" variant="soft" onClick={() => test(p.id)} loading={busy === p.id + ":test"} disabled={!!busy}>
                      <PlugZap className="size-3.5" /> 测试
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => models(p.id)} loading={busy === p.id + ":models"} disabled={!!busy} title="列出可用模型">
                      <List className="size-3.5" />
                    </Button>
                  </div>
                )}
              </div>
              {p.note && !p.configured && <p className="mt-1 text-xs text-muted">{p.note}</p>}
              {r?.kind === "ok" && <p className="mt-2 rounded-lg bg-mint-50 px-2.5 py-1.5 text-xs text-mint-700">{r.text}</p>}
              {r?.kind === "err" && <p className="mt-2 rounded-lg bg-sakura-50 px-2.5 py-1.5 text-xs text-sakura-700">{r.text}</p>}
              {r?.kind === "models" && (
                <div className="mt-2 rounded-lg bg-stone-50 px-2.5 py-2 text-xs">
                  <p className="text-muted">
                    可用模型 {r.models.length} 个，设置 <code>{p.id.toUpperCase()}_MODEL</code> 即可切换：
                  </p>
                  <div className="scrollbar-thin mt-1.5 flex max-h-32 flex-wrap gap-1 overflow-y-auto">
                    {r.models.map((m) => (
                      <code key={m} className={cx("rounded px-1.5 py-0.5", m === p.model ? "bg-mint-100 text-mint-700" : "bg-paper")}>
                        {m}
                      </code>
                    ))}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <button onClick={() => setShowAll((s) => !s)} className="text-xs text-muted hover:text-sakura-600">
        {showAll ? "只显示已配置的" : `查看全部 ${providers.length} 种支持的 AI 服务`}
      </button>
    </Card>
  );
}
