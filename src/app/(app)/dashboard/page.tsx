import Link from "next/link";
import { ArrowRight, Building2, Mail, PenLine, Sparkles, Users } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { stats, upcoming } from "@/lib/data";
import { aiAccess } from "@/lib/ai-access";
import { Card, EmptyState } from "@/components/ui";
import { UpcomingList } from "@/components/upcoming-list";

export const metadata = { title: "首页" };

const quick = [
  { href: "/es", icon: PenLine, title: "添削一篇 ES", body: "贴上草稿，拿到地道日文", tone: "from-sakura-50 to-paper text-sakura-600" },
  { href: "/inbox", icon: Mail, title: "识别企业邮件", body: "自动提取日程和材料", tone: "from-mint-50 to-paper text-mint-700" },
  { href: "/tracker?new=1", icon: Building2, title: "添加公司", body: "开始追踪一家新公司", tone: "from-sky-50 to-paper text-sky-700" },
  { href: "/community", icon: Users, title: "前辈经验", body: "面试经验与工作体验", tone: "from-violet-50 to-paper text-violet-700" },
];

function greeting() {
  const h = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: process.env.APP_TIMEZONE || "Asia/Tokyo" }).format(new Date()));
  return h < 11 ? "早上好" : h < 18 ? "下午好" : "晚上好";
}

export default async function Dashboard() {
  const user = await requireUser();
  const [items, s, ai] = await Promise.all([upcoming(user.id, 0, 14), stats(user.id), aiAccess(user)]);
  const urgent = items.filter((i) => new Date(i.at).getTime() - Date.now() < 3 * 86400000).length;

  return (
    <div className="space-y-6">
      <div className="animate-rise">
        <h1 className="text-2xl font-bold tracking-tight">
          {greeting()}，{user.display_name || "同学"} ☀️
        </h1>
        <p className="mt-1 text-sm text-muted">
          {items.length ? (
            <>
              未来两周有 <b className="text-ink">{items.length}</b> 项日程{urgent ? <>，其中 <b className="text-sakura-600">{urgent}</b> 项在 3 天内</> : null}。
            </>
          ) : (
            "未来两周还没有日程，先添加几家公司吧。"
          )}
        </p>
      </div>

      {ai.demo && user.role === "admin" && (
        <Link href="/admin/ai" className="flex items-start gap-3 rounded-2xl bg-violet-50 px-4 py-3 text-sm text-violet-700 hover:bg-violet-100">
          <Sparkles className="mt-0.5 size-4 shrink-0" />
          <p>
            当前是<b>演示模式</b>：AI 功能返回示例结果。到「管理后台 → AI 与额度」填写任意一家的 API Key（Claude、ChatGPT、DeepSeek、Kimi、通义千问、智谱 GLM、Gemini、豆包…）即可使用真实 AI，无需重启。
          </p>
        </Link>
      )}
      {!ai.allowed && (
        <Link href="/settings" className="flex items-start gap-3 rounded-2xl bg-lemon-50 px-4 py-3 text-sm text-lemon-700 hover:bg-lemon-100">
          <Sparkles className="mt-0.5 size-4 shrink-0" />
          <p>
            AI 功能尚未开通。把你的用户 ID <b className="font-mono">{user.id}</b> 发给管理员即可开通；在此之前可以手动写 ES、追踪选考和分享经验。
          </p>
        </Link>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {quick.map((q, i) => (
          <Link
            key={q.href}
            href={q.href}
            className={`animate-rise group rounded-[var(--radius-card)] border border-line bg-gradient-to-br ${q.tone} p-5 shadow-[var(--shadow-soft)] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)]`}
            style={{ animationDelay: `${60 * i}ms` }}
          >
            <q.icon className="size-6" />
            <div className="mt-3 flex items-center justify-between font-semibold text-ink">
              {q.title}
              <ArrowRight className="size-4 text-muted transition group-hover:translate-x-0.5" />
            </div>
            <p className="mt-0.5 text-sm text-muted">{q.body}</p>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold">接下来两周</h2>
            <Link href="/tracker?view=calendar" className="text-sm text-sakura-600 hover:underline">
              日历
            </Link>
          </div>
          {items.length ? <UpcomingList items={items} /> : <EmptyState title="暂无日程">粘贴企业邮件，AI 会自动把面试和截止日加进来。</EmptyState>}
        </Card>

        <Card>
          <h2 className="font-semibold">投递概况</h2>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {[
              { label: "投递公司", value: s.total, tone: "bg-sky-50 text-sky-700" },
              { label: "进行中", value: s.active, tone: "bg-lemon-50 text-lemon-700" },
              { label: "内定", value: s.offers, tone: "bg-mint-50 text-mint-700" },
              { label: "已结束", value: s.closed, tone: "bg-stone-50 text-stone-700" },
            ].map((t) => (
              <div key={t.label} className={`rounded-2xl px-4 py-3 ${t.tone}`}>
                <div className="text-2xl font-bold tabular-nums">{t.value}</div>
                <div className="text-xs opacity-80">{t.label}</div>
              </div>
            ))}
          </div>
          <h3 className="mt-6 text-sm font-medium">各阶段通过率</h3>
          {s.stages.length ? (
            <ul className="mt-3 space-y-2.5">
              {s.stages.map((st) => (
                <li key={st.name} className="text-sm">
                  <div className="flex justify-between text-xs text-muted">
                    <span>{st.name}</span>
                    <span className="tabular-nums">
                      {st.passed}/{st.decided} · {Math.round((st.rate ?? 0) * 100)}%
                    </span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-stone-50">
                    <div className="h-full rounded-full bg-gradient-to-r from-sakura-300 to-sakura-500" style={{ width: `${(st.rate ?? 0) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted">在公司详情里记录每个阶段的结果后，这里会显示通过率，帮你复盘。</p>
          )}
        </Card>
      </div>
    </div>
  );
}
