"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, ErrorNote, Field, Input } from "@/components/ui";
import { api, errMsg } from "@/lib/client";
import { AuthShell } from "../forgot-password/forgot-form";

export function ResetForm({ token, email }: { token: string; email: string | null }) {
  const router = useRouter();
  const [pw, setPw] = useState({ a: "", b: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pw.a !== pw.b) return setError("两次输入的密码不一致");
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/reset", { body: { token, password: pw.a } });
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(errMsg(err));
      setBusy(false);
    }
  }

  return (
    <AuthShell>
      <Card className="p-6">
        <h1 className="text-xl font-bold">设置新密码</h1>
        {!email ? (
          <div className="mt-4 space-y-3 text-sm">
            <p className="rounded-xl bg-lemon-50 px-4 py-3 text-lemon-700">这个链接无效、已经用过或已过期。</p>
            <Link href="/forgot-password" className="inline-block font-medium text-sakura-600 hover:underline">
              重新申请重置 →
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-5 space-y-4">
            <p className="text-sm text-muted">
              账号：<b className="text-ink">{email}</b>
            </p>
            <Field label="新密码" hint="至少 8 位">
              <Input type="password" required minLength={8} autoComplete="new-password" value={pw.a} onChange={(e) => setPw({ ...pw, a: e.target.value })} />
            </Field>
            <Field label="再输一次">
              <Input type="password" required minLength={8} autoComplete="new-password" value={pw.b} onChange={(e) => setPw({ ...pw, b: e.target.value })} />
            </Field>
            <ErrorNote message={error} />
            <Button type="submit" loading={busy} className="w-full">
              保存并登录
            </Button>
            <p className="text-xs text-muted">设置后，这个账号在其他设备上的登录会全部退出。</p>
          </form>
        )}
      </Card>
    </AuthShell>
  );
}
