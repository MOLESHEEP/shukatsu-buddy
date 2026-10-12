import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { aiAccess } from "@/lib/ai-access";
import { quotaStatus } from "@/lib/quota";
import { Composer } from "../composer";

export const metadata = { title: "分享经验" };

export default async function NewPostPage({ searchParams }: { searchParams: Promise<{ kind?: string; company?: string }> }) {
  const user = await requireUser();
  const [access, quota] = await Promise.all([aiAccess(user), quotaStatus(user)]);
  const ai = { allowed: access.allowed, left: quota.unlimited ? null : Math.max(0, quota.limit.post - quota.used.post), userId: user.id };
  const sp = await searchParams;
  const kind = sp.kind === "work" || (!sp.kind && user.career_stage === "working") ? "work" : "interview";
  const thisMonth = new Date().toISOString().slice(0, 7);
  return (
    <>
      <PageHeader emoji="✏️" title="分享我的经验" subtitle="大致描述一下就好，AI 帮你组织语言。整理后你可以随意修改，确认后才会发布。" />
      <Composer
        profileGradYear={user.grad_year}
        ai={ai}
        initial={{
          kind,
          company_name: sp.company ?? "",
          industry: "",
          role: "",
          occurred_on: thisMonth,
          ended_on: null,
          grad_year: null,
          stage: "",
          result: "unknown",
          employment_type: "",
          rating: null,
          title: "",
          body: "",
          tags: [],
          anonymous: true,
          notes: "",
        }}
      />
    </>
  );
}
