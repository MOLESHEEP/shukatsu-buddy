import Link from "next/link";
import { overview } from "@/lib/admin";
import { providerLabel } from "@/lib/llm/provider";
import { PROVIDERS } from "@/lib/llm/providers";
import { Card } from "@/components/ui";

const TASK_LABELS: Record<string, string> = { es: "ES 添削", es_retry: "ES 字数压缩", email: "邮件识别", reply: "回信", post: "经验整理", review: "发布审核", test: "连接测试" };

export default async function AdminOverview() {
  const [o, label] = await Promise.all([overview(), providerLabel()]);
  const c = o.counts;
  const tiles = [
    { label: "用户总数", value: c.users, sub: `近 7 天新增 ${c.users_new_7d}`, tone: "bg-sky-50 text-sky-700", href: "/admin/users" },
    { label: "7 天活跃", value: c.users_active_7d, sub: `已开通 AI ${c.users_ai_on} · 停用 ${c.users_banned}`, tone: "bg-mint-50 text-mint-700", href: "/admin/users" },
    { label: "新反馈", value: c.feedback_new, sub: `处理中 / 已采纳 ${c.feedback_open}`, tone: c.feedback_new ? "bg-lemon-50 text-lemon-700" : "bg-stone-50 text-stone-700", href: "/admin/feedback" },
    { label: "待处理举报", value: c.reports_open, sub: `已隐藏帖子 ${c.posts_hidden}`, tone: c.reports_open ? "bg-sakura-50 text-sakura-700" : "bg-stone-50 text-stone-700", href: "/admin/reports" },
    { label: "待审核分享", value: c.posts_pending, sub: `用户持有 point ${c.points_outstanding}`, tone: c.posts_pending ? "bg-lemon-50 text-lemon-700" : "bg-stone-50 text-stone-700", href: "/admin/review" },
    { label: "已发布经验", value: c.posts_published, sub: `公司卡片 ${c.companies} · ES ${c.es_docs}`, tone: "bg-violet-50 text-violet-700", href: "/community" },
  ];
  const max = Math.max(1, ...o.daily.map((d) => d.calls));
  const providerName = (id: string) => (id === "mock" ? "演示模式" : (PROVIDERS.find((p) => p.id === id)?.label ?? id));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        {tiles.map((t) => (
          <Link key={t.label} href={t.href} className={`rounded-[var(--radius-card)] p-5 transition hover:-translate-y-0.5 ${t.tone}`}>
            <div className="text-3xl font-bold tabular-nums">{t.value}</div>
            <div className="mt-1 text-sm font-medium">{t.label}</div>
            <div className="mt-0.5 text-xs opacity-75">{t.sub}</div>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <div className="flex items-baseline justify-between">
            <h2 className="font-semibold">AI 调用（近 14 天，成功次数）</h2>
            <span className="text-xs text-muted">今天 {o.ai7.today} 次 · 7 天成功率 {o.ai7.calls ? Math.round((o.ai7.ok / o.ai7.calls) * 100) : 100}%</span>
          </div>
          <div className="mt-5 flex h-40 items-end gap-1.5">
            {o.daily.map((d) => (
              <div key={d.day} className="group flex flex-1 flex-col items-center gap-1">
                <span className="text-[10px] text-muted opacity-0 transition group-hover:opacity-100">{d.calls}</span>
                <div className="w-full rounded-t-md bg-gradient-to-t from-violet-300 to-violet-500" style={{ height: `${Math.max(2, (d.calls / max) * 120)}px` }} />
                <span className="text-[10px] tabular-nums text-muted">{d.day.slice(3)}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted">当前引擎：{label}</p>
        </Card>

        <Card>
          <h2 className="font-semibold">近 30 天用量</h2>
          <h3 className="mt-3 text-xs font-medium text-muted">按服务 / 模型</h3>
          {o.aiByProvider.length ? (
            <table className="mt-1.5 w-full text-sm">
              <tbody>
                {o.aiByProvider.map((r) => (
                  <tr key={r.provider + r.model} className="border-t border-line">
                    <td className="py-1.5">
                      {providerName(r.provider)} <span className="text-xs text-muted">{r.model}</span>
                    </td>
                    <td className="py-1.5 text-right tabular-nums">{r.calls}</td>
                    <td className="py-1.5 text-right text-xs tabular-nums text-muted">{r.calls ? Math.round((r.ok / r.calls) * 100) : 0}% · {(r.avg_ms / 1000).toFixed(1)}s</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="mt-1 text-sm text-muted">还没有调用记录</p>
          )}
          <h3 className="mt-4 text-xs font-medium text-muted">按功能</h3>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {o.aiByTask.map((t) => (
              <span key={t.task} className="rounded-full bg-stone-50 px-2.5 py-1 text-xs">
                {TASK_LABELS[t.task] ?? t.task} <b className="tabular-nums">{t.calls}</b>
              </span>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
