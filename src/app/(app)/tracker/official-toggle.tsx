"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, errMsg } from "@/lib/client";
import { cx } from "@/components/ui";

/** Show / hide admin-published 官方选考日程 on the calendar, dashboard and calendar feed. */
export function OfficialToggle({ show }: { show: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted">
      <span className="rounded bg-violet-50 px-1 font-semibold text-violet-700 ring-1 ring-inset ring-violet-100">官</span>
      管理员发布的官方选考日程，和你自己的日程分开标出
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await api("/api/official/preferences", { body: { show: !show } });
            router.refresh();
          } catch (e) {
            alert(errMsg(e));
          } finally {
            setBusy(false);
          }
        }}
        className={cx("rounded-full px-2.5 py-0.5 font-medium transition", show ? "bg-paper text-ink shadow-sm hover:bg-stone-50" : "bg-violet-500 text-white hover:bg-violet-600")}
      >
        {show ? "不显示官方日程" : "显示官方日程"}
      </button>
    </div>
  );
}
