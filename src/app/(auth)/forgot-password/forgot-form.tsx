"use client";

import Link from "next/link";
import { useState } from "react";
import { MailCheck } from "lucide-react";
import { Button, Card, ErrorNote, Field, Input } from "@/components/ui";
import { api, errMsg } from "@/lib/client";

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-5 py-10">
      <div className="animate-rise w-full max-w-sm">
        <Link href="/" className="mb-6 flex items-center justify-center gap-2 font-bold">
          <img src="/icon.svg" alt="" className="size-9" />
          就活小助手
        </Link>
        {children}
        <p className="mt-5 text-center text-sm text-muted">
          想起来了？
          <Link href="/login" className="ml-1 font-medium text-sakura-600 hover:underline">
            返回登录
          </Link>
        </p>
      </div>
    </main>
  );
}

export function ForgotForm({ mail }: { mail: boolean }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ message: string }>("/api/auth/forgot", { body: { email, website: (e.currentTarget as HTMLFormElement).website?.value } });
      setDone(r.message);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell>
      <Card className="p-6">
        <h1 className="text-xl font-bold">忘记密码 🔑</h1>
        {!mail ? (
          <div className="mt-4 space-y-3 text-sm leading-relaxed">
            <p>本站暂未开启邮件找回。请联系网站管理员，告诉对方你的<b>注册邮箱</b>，管理员会给你一个重置链接。</p>
            <p className="text-xs text-muted">拿到链接后直接打开，就可以设置新密码（链接 24 小时内有效、只能用一次）。</p>
          </div>
        ) : done ? (
          <div className="mt-4 flex gap-3 rounded-xl bg-mint-50 px-4 py-3 text-sm text-mint-700">
            <MailCheck className="mt-0.5 size-5 shrink-0" />
            <p>{done}</p>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-5 space-y-4">
            <p className="text-sm text-muted">输入注册时用的邮箱，我们会发送一个重置密码的链接。</p>
            <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 opacity-0" />
            <Field label="邮箱">
              <Input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            </Field>
            <ErrorNote message={error} />
            <Button type="submit" loading={busy} className="w-full">
              发送重置链接
            </Button>
          </form>
        )}
      </Card>
    </AuthShell>
  );
}
