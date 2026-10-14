import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getCompanyDetail } from "@/lib/data";
import { postsForCompany } from "@/lib/posts";
import { openingsForCompany } from "@/lib/openings";
import { CompanyDetail } from "./detail";

export default async function CompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const detail = await getCompanyDetail(user.id, id);
  if (!detail) notFound();
  const [posts, openings] = await Promise.all([postsForCompany(user.id, detail.company.name), openingsForCompany(user.id, detail.company.name)]);
  return <CompanyDetail {...detail} posts={posts} openings={openings} />;
}
