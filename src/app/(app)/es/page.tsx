import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { listCompanies } from "@/lib/data";
import { quotaInfo } from "@/lib/quota";
import { PageHeader } from "@/components/ui";
import { EsWorkbench, type EsDoc } from "./workbench";

export const metadata = { title: "ES添削" };

export default async function EsPage({ searchParams }: { searchParams: Promise<{ company?: string; doc?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const [companies, rows] = await Promise.all([
    listCompanies(user.id),
    query(
      `SELECT id, company_id, company_name, question, char_limit, draft, rewritten, review, is_material, material_tag, created_at
         FROM es_docs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 60`,
      [user.id],
    ),
  ]);
  const docs: EsDoc[] = rows.map((r) => ({
    ...(r as EsDoc),
    id: Number(r.id),
    company_id: r.company_id == null ? null : Number(r.company_id),
    created_at: (r.created_at as Date).toISOString(),
  }));
  const q = quotaInfo(user);

  return (
    <>
      <PageHeader
        emoji="✍️"
        title="ES 添削"
        subtitle="中文或日文草稿都可以。AI 改写成地道日文，并用中文逐句解释为什么这样改。"
        action={q.enforced ? <span className="text-xs text-muted">免费额度：{Math.max(0, q.es.limit - q.es.used)} / {q.es.limit} 次</span> : null}
      />
      <EsWorkbench
        companies={companies.map((c) => ({ id: c.id, name: c.name }))}
        docs={docs}
        initialCompanyId={sp.company ? Number(sp.company) : null}
        initialDocId={sp.doc ? Number(sp.doc) : null}
      />
    </>
  );
}
