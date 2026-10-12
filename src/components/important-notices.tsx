"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Megaphone, X } from "lucide-react";
import { api } from "@/lib/client";

type Notice = { id: number; title: string; body: string; link: string };

/** Unread "important" announcements pinned to the top of the dashboard until acknowledged. */
export function ImportantNotices({ notices }: { notices: Notice[] }) {
  const router = useRouter();
  const [hidden, setHidden] = useState<number[]>([]);
  const visible = notices.filter((n) => !hidden.includes(n.id));
  if (!visible.length) return null;
  async function ack(id: number) {
    setHidden((h) => [...h, id]);
    await api("/api/notifications", { body: { ids: [id] } });
    router.refresh();
  }
  return (
    <div className="space-y-2">
      {visible.map((n) => (
        <div key={n.id} className="animate-rise flex items-start gap-3 rounded-2xl border border-lemon-100 bg-lemon-50 px-4 py-3 text-sm text-lemon-700">
          <Megaphone className="mt-0.5 size-4 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{n.title}</p>
            {n.body && <p className="mt-0.5 line-clamp-3 whitespace-pre-wrap opacity-90">{n.body}</p>}
            {n.link && (
              <Link href={n.link} target={n.link.startsWith("http") ? "_blank" : undefined} className="mt-1 inline-block font-medium underline">
                查看详情
              </Link>
            )}
          </div>
          <button onClick={() => ack(n.id)} className="shrink-0 rounded-full bg-paper/70 px-3 py-1 text-xs font-medium hover:bg-paper" aria-label="知道了">
            知道了 <X className="ml-0.5 inline size-3" />
          </button>
        </div>
      ))}
    </div>
  );
}
