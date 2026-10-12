import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { listCompanies } from "@/lib/data";
import { quotaStatus } from "@/lib/quota";
import { aiAccess } from "@/lib/ai-access";
import { PageHeader } from "@/components/ui";
import { EsWorkbench, type EsDoc } from "./workbench";

export const metadata = { title: "ES添削" };

export default async function EsPage({ searchParams }: { searchParams: Promise<{ company?: string; doc?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const [companies, rows, ai, quota] = await Promise.all([
    listCompanies(user.id),
    query(
      `SELECT id, company_id, company_name, question, char_limit, draft, rewritten, review, is_material, material_tag, created_at
         FROM es_docs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 60`,
      [user.id],
    ),
    aiAccess(user),
    quotaStatus(user),
  ]);
  const docs: EsDoc[] = rows.map((r) => ({ ...(r as EsDoc), created_at: (r.created_at as Date).toISOString() }));
  const left = quota.unlimited ? null : Math.max(0, quota.limit.es - quota.used.es);

  return (
    <>
      <PageHeader
        emoji="✍️"
        title="ES 添削"
        subtitle="中文或日文草稿都可以。用 AI 改写成地道日文并逐句说明原因，或者自己写好直接保存。"
        action={ai.allowed && left != null ? <span className="text-xs text-muted">今天还可以 AI 添削 {left} / {quota.limit.es} 次</span> : null}
      />
      <EsWorkbench
        companies={companies.map((c) => ({ id: c.id, name: c.name }))}
        docs={docs}
        initialCompanyId={sp.company ? Number(sp.company) : null}
        initialDocId={sp.doc ? Number(sp.doc) : null}
        ai={{ allowed: ai.allowed, left, userId: user.id }}
      />
    </>
  );
}
