import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { TEST_FORMATS, TEST_STATUS, TEST_TYPES, type TestTypeKey } from "@/lib/constants";
import { formatDateTime } from "@/lib/time";
import { Badge, Card, EmptyState, PageHeader, cx } from "@/components/ui";

export const metadata = { title: "笔试" };

type Row = { id: string; company_id: string; company: string; type: TestTypeKey; format: string; deadline: Date | null; status: string };

export default async function TestsPage() {
  const user = await requireUser();
  const rows = await query<Row>(
    `SELECT t.id, t.company_id, c.name AS company, t.type, t.format, t.deadline, t.status
       FROM tests t JOIN companies c ON c.id = t.company_id
      WHERE c.user_id = $1
      ORDER BY t.deadline NULLS LAST`,
    [user.id],
  );

  // Group by type; the type with the most open tests is what to prepare first.
  const groups = (Object.keys(TEST_TYPES) as TestTypeKey[])
    .map((type) => ({ type, rows: rows.filter((r) => r.type === type) }))
    .map((g) => ({ ...g, open: g.rows.filter((r) => r.status === "todo").length }))
    .sort((a, b) => b.open - a.open || b.rows.length - a.rows.length);
  const withTests = groups.filter((g) => g.rows.length);
  const priority = withTests.find((g) => g.open > 0 && g.type !== "unknown");

  return (
    <>
      <PageHeader emoji="📝" title="笔试准备" subtitle="按笔试类型汇总你投递的公司，决定优先准备哪一种。点击类型查看题型说明和留学生易失分点。" />

      {withTests.length ? (
        <div className="space-y-6">
          {priority && (
            <div className="animate-rise rounded-[var(--radius-card)] bg-gradient-to-r from-lemon-100 to-sakura-50 p-5">
              <p className="text-sm text-lemon-700">建议优先准备</p>
              <p className="mt-1 text-2xl font-bold">
                {TEST_TYPES[priority.type].label}
                <span className="ml-2 text-base font-normal text-muted">{priority.open} 家公司待受检</span>
              </p>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {withTests.map((g) => (
              <Card key={g.type}>
                <div className="flex items-center justify-between">
                  <a href={`#${g.type}`} className="font-semibold hover:text-sakura-600">
                    {TEST_TYPES[g.type].label}
                  </a>
                  <Badge tone={g.open ? "lemon" : "mint"}>{g.open ? `${g.open} 待受检` : "已完成"}</Badge>
                </div>
                <ul className="mt-3 space-y-2">
                  {g.rows.map((r) => (
                    <li key={r.id}>
                      <Link href={`/tracker/${r.company_id}`} className="flex items-center justify-between gap-2 text-sm hover:text-sakura-600">
                        <span className="truncate">{r.company}</span>
                        <span className="shrink-0 text-xs text-muted">{r.deadline ? formatDateTime(r.deadline) : TEST_STATUS[r.status]}</span>
                      </Link>
                      <div className="text-xs text-muted">{TEST_FORMATS[r.format]}</div>
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
        </div>
      ) : (
        <EmptyState title="还没有笔试记录">在公司详情页记录笔试，或在「邮件助手」粘贴受检通知，AI 会自动识别类型。</EmptyState>
      )}

      <h2 className="mt-10 mb-4 text-lg font-bold">各类型备考指南</h2>
      <div className="grid gap-4 lg:grid-cols-2">
        {(Object.keys(TEST_TYPES) as TestTypeKey[])
          .filter((k) => k !== "unknown")
          .map((k, i) => {
            const t = TEST_TYPES[k];
            const tone = ["sakura", "sky", "violet", "lemon", "mint", "stone", "sky"][i];
            return (
              <Card key={k} id={k} className="scroll-mt-6">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">{t.label}</h3>
                  <Badge tone={tone}>{t.vendor}</Badge>
                </div>
                <p className="mt-2 text-sm text-muted">{t.summary}</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl bg-mint-50 p-3">
                    <p className="text-xs font-semibold text-mint-700">备考要点</p>
                    <ul className="mt-1 space-y-1 text-xs leading-relaxed text-mint-700">
                      {t.tips.map((x) => (
                        <li key={x}>· {x}</li>
                      ))}
                    </ul>
                  </div>
                  {t.pitfalls.length > 0 && (
                    <div className="rounded-2xl bg-sakura-50 p-3">
                      <p className="text-xs font-semibold text-sakura-700">留学生易失分点</p>
                      <ul className="mt-1 space-y-1 text-xs leading-relaxed text-sakura-700">
                        {t.pitfalls.map((x) => (
                          <li key={x}>· {x}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                {t.resources.length > 0 && (
                  <div className={cx("mt-3 flex flex-wrap gap-3 text-xs")}>
                    {t.resources.map((r) => (
                      <a key={r.url} href={r.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sky-700 hover:underline">
                        {r.label} <ExternalLink className="size-3" />
                      </a>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
      </div>
      <p className="mt-6 text-xs text-muted">注：以上为常见类型的概述，各类型的具体题型与规则会更新，请以官方或最新资料为准。</p>
    </>
  );
}
