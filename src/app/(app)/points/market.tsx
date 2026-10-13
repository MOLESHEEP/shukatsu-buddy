"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, cx } from "@/components/ui";
import { api, errMsg } from "@/lib/client";

/** Whether to spend points automatically once today's free AI uses run out. */
export function AutoAiToggle({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);
  async function toggle() {
    setBusy(true);
    try {
      setOn((await api<{ autoAi: boolean }>("/api/points", { method: "PATCH", body: { autoAi: !on } })).autoAi);
    } finally {
      setBusy(false);
    }
  }
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl bg-stone-50 px-3 py-2 text-sm">
      <span>
        免费次数用完后自动使用 point
        <span className="block text-xs text-muted">{on ? "已开启：用完后每次扣 1 点" : "已关闭：用完后当天不能再用 AI"}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        disabled={busy}
        onClick={toggle}
        className={cx("relative h-6 w-11 shrink-0 rounded-full transition", on ? "bg-mint-500" : "bg-stone-100 ring-1 ring-inset ring-line")}
      >
        <span className={cx("absolute top-0.5 size-5 rounded-full bg-white shadow transition-all", on ? "left-[22px]" : "left-0.5")} />
      </button>
    </label>
  );
}

export function RedeemButton({ item, cost, balance }: { item: string; cost: number; balance: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  async function redeem() {
    if (!confirm(`花 ${cost} point 兑换？`)) return;
    setBusy(true);
    setMsg(null);
    try {
      setMsg((await api<{ message: string }>("/api/points", { body: { item } })).message);
      router.refresh();
    } catch (e) {
      setMsg(errMsg(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-1.5">
      <Button size="sm" onClick={redeem} loading={busy} disabled={balance < cost}>
        {balance < cost ? `还差 ${cost - balance} point` : "兑换"}
      </Button>
      {msg && <p className="text-xs text-muted">{msg}</p>}
    </div>
  );
}
