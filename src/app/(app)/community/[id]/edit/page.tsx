import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getOwnPostWithNotes } from "@/lib/posts";
import { PageHeader } from "@/components/ui";
import { aiAccess } from "@/lib/ai-access";
import { quotaStatus } from "@/lib/quota";
import { Composer } from "../../composer";

export const metadata = { title: "编辑分享" };

export default async function EditPostPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const [access, quota] = await Promise.all([aiAccess(user), quotaStatus(user)]);
  const ai = { allowed: access.allowed, left: quota.unlimited ? null : Math.max(0, quota.limit.post - quota.used.post), userId: user.id };
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const found = await getOwnPostWithNotes(user.id, id);
  if (!found) notFound();
  const { post, notes } = found;
  return (
    <>
      <PageHeader emoji="✏️" title="编辑分享" subtitle={post.status === "published" ? "修改后需要再次预览确认，才会更新已发布的内容。" : "草稿仅自己可见。"} />
      <Composer
        profileGradYear={user.grad_year}
        ai={ai}
        initial={{
          id: post.id,
          status: post.status,
          kind: post.kind,
          company_name: post.company_name,
          industry: post.industry,
          role: post.role,
          occurred_on: post.occurred_on,
          ended_on: post.ended_on,
          grad_year: post.grad_year,
          stage: post.stage,
          result: post.result,
          employment_type: post.employment_type,
          rating: post.rating,
          title: post.title,
          body: post.body,
          tags: post.tags,
          anonymous: post.anonymous,
          notes,
        }}
      />
    </>
  );
}
