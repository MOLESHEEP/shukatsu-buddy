import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, CalendarDays, ClipboardCheck, Mail, PenLine, Users } from "lucide-react";
import { getUserId } from "@/lib/auth";

const features = [
  { icon: PenLine, tone: "bg-sakura-50 text-sakura-600", title: "ES 添削", body: "中文或日文草稿都行。AI 给出地道日文改写、逐句中文说明，严格控制字数。" },
  { icon: CalendarDays, tone: "bg-sky-50 text-sky-600", title: "选考追踪", body: "看板 + 日历，几十家公司的截止日和面试一目了然，可订阅到手机日历提醒。" },
  { icon: Mail, tone: "bg-mint-50 text-mint-600", title: "日文邮件识别", body: "粘贴企业来信，自动提取日期、地点、所需材料，一键写入公司卡片，还能生成敬语回信。" },
  { icon: ClipboardCheck, tone: "bg-lemon-50 text-lemon-700", title: "笔试类型", body: "SPI、玉手箱、TG-WEB… 按公司记录笔试类型，告诉你该优先准备哪一种。" },
  { icon: Users, tone: "bg-violet-50 text-violet-600", title: "经验分享", body: "前辈们的面试经验和入职后的真实工作体验，每篇都标注时间。随便说说，AI 帮你整理成文，确认后再发布。" },
];

export default async function Landing() {
  if (await getUserId()) redirect("/dashboard");
  return (
    <main className="mx-auto max-w-5xl px-5 py-10 sm:py-16">
      <nav className="flex items-center justify-between">
        <div className="flex items-center gap-2 font-bold">
          <img src="/icon.svg" alt="" className="size-8" />
          就活小助手
        </div>
        <Link href="/login" className="rounded-full px-4 py-2 text-sm font-medium text-muted hover:bg-paper hover:text-ink">
          登录
        </Link>
      </nav>

      <section className="animate-rise mt-14 text-center sm:mt-20">
        <span className="inline-block rounded-full bg-paper px-3 py-1 text-xs font-medium text-sakura-600 shadow-[var(--shadow-soft)]">
          给在日本求职、工作的中国人 🌸
        </span>
        <h1 className="mx-auto mt-5 max-w-2xl text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
          中文思考，<span className="text-sakura-500">日文表达</span>
          <br />
          让就活轻松一点
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-muted">
          用中文解释日本就活规则和修改理由。只做辅导和反馈，不做代写 —— 让你的 ES 和面试真正变好。
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link
            href="/register"
            className="inline-flex items-center gap-1.5 rounded-full bg-sakura-500 px-6 py-3 text-sm font-medium text-white shadow-[var(--shadow-lift)] transition hover:bg-sakura-600"
          >
            免费开始 <ArrowRight className="size-4" />
          </Link>
          <Link href="/login" className="rounded-full bg-paper px-6 py-3 text-sm font-medium shadow-[var(--shadow-soft)] hover:bg-stone-50">
            我有账号
          </Link>
        </div>
      </section>

      <section className="mt-16 grid gap-4 sm:mt-24 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((f, i) => (
          <div
            key={f.title}
            className="animate-rise rounded-[var(--radius-card)] border border-line bg-paper p-6 shadow-[var(--shadow-soft)]"
            style={{ animationDelay: `${80 * i}ms` }}
          >
            <div className={`inline-flex size-11 items-center justify-center rounded-2xl ${f.tone}`}>
              <f.icon className="size-5" />
            </div>
            <h3 className="mt-4 font-semibold">{f.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">{f.body}</p>
          </div>
        ))}
      </section>

      <p className="mt-16 text-center text-xs text-muted">邮件和 ES 内容只用于为你生成结果，不做公开汇总，可随时一键删除。</p>
    </main>
  );
}
