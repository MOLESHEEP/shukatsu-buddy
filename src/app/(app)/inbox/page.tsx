import { requireUser } from "@/lib/auth";
import { listCompanies } from "@/lib/data";
import { quotaStatus } from "@/lib/quota";
import { aiAccess } from "@/lib/ai-access";
import { PageHeader } from "@/components/ui";
import { Inbox } from "./inbox";

export const metadata = { title: "邮件助手" };

export default async function InboxPage() {
  const user = await requireUser();
  const [companies, ai, quota] = await Promise.all([listCompanies(user.id), aiAccess(user), quotaStatus(user)]);
  const left = quota.unlimited ? null : Math.max(0, quota.limit.email - quota.used.email);
  return (
    <>
      <PageHeader
        emoji="💌"
        title="邮件助手"
        subtitle="粘贴企业的日文来信，AI 提取日期、地点、材料和回复期限，确认后写入公司卡片；也可以生成符合商务敬语的回信。"
        action={ai.allowed && left != null ? <span className="text-xs text-muted">今天还可以使用 {left} / {quota.limit.email} 次</span> : null}
      />
      <Inbox companies={companies.map((c) => ({ id: c.id, name: c.name }))} userName={user.display_name} ai={{ allowed: ai.allowed, left, userId: user.id }} />
    </>
  );
}
