import { requireAdmin } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { AdminTabs } from "./tabs";

export const metadata = { title: "管理后台" };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <>
      <PageHeader emoji="🛡️" title="管理后台" subtitle="AI 服务、用户权限与额度、内容审核。" />
      <AdminTabs />
      <div className="mt-5">{children}</div>
    </>
  );
}
