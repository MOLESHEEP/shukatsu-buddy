import { requireUser } from "@/lib/auth";
import { listCompanies } from "@/lib/data";
import { quotaInfo } from "@/lib/quota";
import { PageHeader } from "@/components/ui";
import { Inbox } from "./inbox";

export const metadata = { title: "邮件助手" };

export default async function InboxPage() {
  const user = await requireUser();
  const companies = await listCompanies(user.id);
  const q = quotaInfo(user);
  return (
    <>
      <PageHeader
        emoji="💌"
        title="邮件助手"
        subtitle="粘贴企业的日文来信，AI 提取日期、地点、材料和回复期限，确认后写入公司卡片；也可以生成符合商务敬语的回信。"
        action={q.enforced ? <span className="text-xs text-muted">免费额度：{Math.max(0, q.email.limit - q.email.used)} / {q.email.limit} 次</span> : null}
      />
      <Inbox companies={companies.map((c) => ({ id: c.id, name: c.name }))} userName={user.display_name} />
    </>
  );
}
