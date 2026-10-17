"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, Check } from "lucide-react";
import { Button } from "@/components/ui";
import { api, errMsg } from "@/lib/client";

export function TrackOfficial({ id, trackedCompanyId }: { id: number; trackedCompanyId: number | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (trackedCompanyId) {
    return (
      <Link href={`/tracker/${trackedCompanyId}`} className="inline-flex items-center gap-1 text-sm font-medium text-mint-700 hover:underline">
        <Check className="size-4" /> 已加入我的选考追踪
      </Link>
    );
  }
  return (
    <>
      <Button
        size="sm"
        loading={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await api(`/api/official/${id}/track`, { method: "POST" });
            router.refresh();
          } catch (e) {
            setError(errMsg(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <CalendarPlus className="size-4" /> 加入我的选考追踪
      </Button>
      {error && <span className="text-xs text-sakura-700">{error}</span>}
    </>
  );
}
