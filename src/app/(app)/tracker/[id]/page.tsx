import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getCompanyDetail } from "@/lib/data";
import { postsForCompany } from "@/lib/posts";
import { CompanyDetail } from "./detail";

export default async function CompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const detail = await getCompanyDetail(user.id, id);
  if (!detail) notFound();
  const posts = await postsForCompany(user.id, detail.company.name);
  return <CompanyDetail {...detail} posts={posts} />;
}
