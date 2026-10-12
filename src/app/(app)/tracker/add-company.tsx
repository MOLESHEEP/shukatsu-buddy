"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { Button, Card, ErrorNote, Field, Input, Textarea } from "@/components/ui";
import { api, errMsg } from "@/lib/client";

export function AddCompany({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(defaultOpen);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    setLoading(true);
    setError(null);
    try {
      const { id } = await api<{ id: number }>("/api/companies", { body: { ...f, next_deadline: f.next_deadline || null } });
      setOpen(false);
      router.push(`/tracker/${id}`);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        添加公司
      </Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/20 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={() => setOpen(false)}>
          <Card className="animate-rise max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-b-none sm:rounded-b-[var(--radius-card)]" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">添加公司 🏢</h2>
              <button onClick={() => setOpen(false)} className="rounded-full p-1.5 text-muted hover:bg-stone-50" aria-label="关闭">
                <X className="size-5" />
              </button>
            </div>
            <form onSubmit={onSubmit} className="space-y-4">
              <Field label="公司名">
                <Input name="name" required autoFocus placeholder="例：株式会社〇〇" />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="行业">
                  <Input name="industry" placeholder="IT / 商社 / 金融…" />
                </Field>
                <Field label="投递渠道">
                  <Input name="channel" placeholder="官网 / マイナビ / 内推…" />
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="下一步">
                  <Input name="next_action" placeholder="例：ES 提交" />
                </Field>
                <Field label="截止时间">
                  <Input name="next_deadline" type="datetime-local" />
                </Field>
              </div>
              <Field label="备注">
                <Textarea name="notes" rows={3} placeholder="公司特点、志望理由要点、OB 访问记录…（ES 添削时会参考）" />
              </Field>
              <p className="text-xs text-muted">会自动建立标准选考流程（エントリー → … → 内定），之后可以在详情页增删阶段。</p>
              <ErrorNote message={error} />
              <Button type="submit" loading={loading} className="w-full">
                添加
              </Button>
            </form>
          </Card>
        </div>
      )}
    </>
  );
}
