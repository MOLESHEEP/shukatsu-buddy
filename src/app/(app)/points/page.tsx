import Link from "next/link";
import { PenLine } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { pointSummary } from "@/lib/points";
import { quotaStatus } from "@/lib/quota";
import { aiAccess } from "@/lib/ai-access";
import { AI_ITEM_LABELS, MARKET_ITEMS, POINT_KINDS, POINTS_PER_POST } from "@/lib/points-market";
import { Badge, Card, EmptyState, PageHeader, cx } from "@/components/ui";
import { AutoAiToggle, RedeemButton } from "./market";

export const metadata = { title: "积分 · Point Market" };

export default async function PointsPage() {
  const user = await requireUser();
  const [s, quota, ai] = await Promise.all([pointSummary(user.id), quotaStatus(user), aiAccess(user)]);
  const capLeft = Math.max(0, s.dailyCap - s.earnedToday);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader emoji="🪙" title="Point Market" subtitle="分享经验赚 point，用 point 换更多 AI 次数。以后上线的新功能也会在这里兑换。" />

      <div className="grid gap-4 sm:grid-cols-[1.1fr_1fr]">
        <Card className="bg-gradient-to-br from-lemon-50 to-paper">
          <p className="text-sm font-medium text-lemon-700">我的 point</p>
          <p className="mt-1 text-5xl font-bold tabular-nums">{s.balance}</p>
          <div className="mt-4 space-y-1.5">
            <div className="flex items-baseline justify-between text-xs text-muted">
              <span>今天已获得</span>
              <span className="tabular-nums">
                {s.earnedToday} / {s.dailyCap}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-paper">
              <div className="h-full rounded-full bg-lemon-500 transition-all" style={{ width: `${s.dailyCap ? Math.min(100, (s.earnedToday / s.dailyCap) * 100) : 100}%` }} />
            </div>
            <p className="text-xs text-muted">
              {capLeft > 0 ? `今天还能再获得 ${capLeft} 点` : "今天的获取上限已满，明天 0 点（日本时间）重置"}
              {s.pendingPosts > 0 && ` · ${s.pendingPosts} 篇分享审核中`}
            </p>
          </div>
        </Card>

        <Card className="space-y-3">
          <p className="font-semibold">怎么获得 point</p>
          <ul className="space-y-1.5 text-sm text-muted">
            <li>🎤 分享一篇<b className="text-ink">面试经验</b>，或 💼 一篇<b className="text-ink">工作体验</b></li>
            <li>🧾 通过审核后自动 +{POINTS_PER_POST} point（同一篇只奖励一次）</li>
            <li>📅 每天最多获得 {s.dailyCap} point</li>
          </ul>
          <p className="text-xs text-muted">审核要求：真实有效的求职 / 工作经历，不含反动、色情、暴力、营销引流、诋毁、人身攻击和他人隐私。</p>
          <Link href="/community/new" className="inline-flex items-center gap-1.5 rounded-full bg-sakura-500 px-4 py-2 text-sm font-medium text-white shadow-[var(--shadow-lift)] hover:bg-sakura-600">
            <PenLine className="size-4" /> 去分享经验
          </Link>
        </Card>
      </div>

      <section className="space-y-3">
        <h2 className="font-semibold">🛍️ 兑换</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {MARKET_ITEMS.map((item) => (
            <Card key={item.id} className={cx("flex flex-col gap-3", item.mode === "soon" && "opacity-60")}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">
                    <span className="mr-1.5">{item.emoji}</span>
                    {item.title}
                  </p>
                  <p className="mt-1 text-sm text-muted">{item.description}</p>
                </div>
                <Badge tone="lemon">{item.cost} point</Badge>
              </div>
              <div className="mt-auto">
                {item.id === "ai_extra" ? (
                  <div className="space-y-2">
                    {!ai.allowed ? (
                      <p className="rounded-xl bg-stone-50 px-3 py-2 text-xs text-muted">你的账号还没有开通 AI 功能，开通后才能使用（把用户 ID {user.id} 发给管理员）。</p>
                    ) : quota.unlimited ? (
                      <p className="rounded-xl bg-violet-50 px-3 py-2 text-xs text-violet-700">管理员不受每日次数限制，不会消耗 point。</p>
                    ) : (
                      <p className="text-xs text-muted">
                        今天免费剩余：
                        {(["es", "email", "post"] as const).map((k) => `${AI_ITEM_LABELS[k]} ${Math.max(0, quota.limit[k] - quota.used[k])}`).join(" · ")}
                      </p>
                    )}
                    <AutoAiToggle initial={s.autoAi} />
                  </div>
                ) : item.mode === "redeem" ? (
                  <RedeemButton item={item.id} cost={item.cost} balance={s.balance} />
                ) : (
                  <span className="text-xs text-muted">即将上线</span>
                )}
              </div>
            </Card>
          ))}
          <Card className="flex items-center justify-center border-dashed bg-paper/60 text-center text-sm text-muted">
            更多兑换项目即将上线 ✨
            <br />
            有想要的功能？去「意见反馈」告诉我们
          </Card>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">📜 point 明细</h2>
        {s.history.length === 0 ? (
          <EmptyState title="还没有记录">分享的经验通过审核后，会在这里看到第一笔 point。</EmptyState>
        ) : (
          <Card className="divide-y divide-line p-0">
            {s.history.map((h) => {
              const k = POINT_KINDS[h.kind] ?? { label: h.kind, tone: "stone" };
              const detail = h.kind === "ai_extra" || h.kind === "ai_refund" ? AI_ITEM_LABELS[h.item] ?? h.item : h.note;
              return (
                <div key={h.id} className="flex items-center gap-3 px-5 py-3">
                  <Badge tone={k.tone}>{k.label}</Badge>
                  <div className="min-w-0 flex-1 text-sm">
                    {h.post_id && h.kind === "post_reward" ? (
                      <Link href={`/community/${h.post_id}`} className="hover:text-sakura-600">
                        {detail || "查看分享"}
                      </Link>
                    ) : (
                      <span className="text-muted">{detail}</span>
                    )}
                    <div className="text-xs text-muted">{new Date(h.created_at).toLocaleString("zh-CN", { timeZone: "Asia/Tokyo" })}</div>
                  </div>
                  <div className="text-right tabular-nums">
                    <div className={cx("font-semibold", h.delta > 0 ? "text-mint-700" : "text-sakura-700")}>{h.delta > 0 ? `+${h.delta}` : h.delta}</div>
                    <div className="text-xs text-muted">余额 {h.balance_after}</div>
                  </div>
                </div>
              );
            })}
          </Card>
        )}
      </section>
    </div>
  );
}
