import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getOpening } from "@/lib/openings";
import { PageHeader } from "@/components/ui";
import { ReportForm } from "./report-form";

export const metadata = { title: "上报选考开放" };

export default async function NewOpeningReport({ searchParams }: { searchParams: Promise<{ opening?: string; company?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const target = Number(sp.opening) ? await getOpening(Number(sp.opening)) : null;
  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/openings" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ChevronLeft className="size-4" /> 选考开放
      </Link>
      <PageHeader
        emoji="📣"
        title={target ? `纠错 / 补充：${target.company_name}` : "上报本选考开放"}
        subtitle={target ? "把你看到的最新信息填进来，审核通过后会更新这条记录并通知关注的同学。" : "看到哪家公司开放了本选考エントリー？告诉大家，或者只记到自己的选考追踪里。"}
      />
      <ReportForm target={target} defaultCompany={sp.company ?? ""} defaultGradYear={user.grad_year} />
    </div>
  );
}
