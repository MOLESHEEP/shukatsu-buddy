"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Card, ErrorNote, Field, Input } from "@/components/ui";
import { api, errMsg } from "@/lib/client";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const search = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setLoading(true);
    setError(null);
    try {
      await api(`/api/auth/${mode}`, { body: Object.fromEntries(form) });
      const next = search.get("next");
      router.push(next && next.startsWith("/") ? next : "/dashboard");
      router.refresh();
    } catch (err) {
      setError(errMsg(err));
      setLoading(false);
    }
  }

  const isLogin = mode === "login";
  return (
    <main className="flex min-h-dvh items-center justify-center px-5 py-10">
      <div className="animate-rise w-full max-w-sm">
        <Link href="/" className="mb-6 flex items-center justify-center gap-2 font-bold">
          <img src="/icon.svg" alt="" className="size-9" />
          就活小助手
        </Link>
        <Card className="p-6">
          <h1 className="text-xl font-bold">{isLogin ? "欢迎回来 👋" : "创建账号 🌱"}</h1>
          <p className="mt-1 text-sm text-muted">{isLogin ? "继续你的就活进度" : "30 秒开始，选考追踪永久免费"}</p>
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            {!isLogin && (
              <Field label="名字" hint="用于回信署名，可稍后修改">
                <Input name="display_name" placeholder="例：王 小明" autoComplete="name" />
              </Field>
            )}
            <Field label="邮箱">
              <Input name="email" type="email" required autoComplete="email" placeholder="you@example.com" />
            </Field>
            <Field label="密码" hint={isLogin ? undefined : "至少 8 位"}>
              <Input name="password" type="password" required minLength={isLogin ? 1 : 8} autoComplete={isLogin ? "current-password" : "new-password"} />
            </Field>
            <ErrorNote message={error} />
            <Button type="submit" loading={loading} className="w-full">
              {isLogin ? "登录" : "注册并开始"}
            </Button>
          </form>
        </Card>
        <p className="mt-5 text-center text-sm text-muted">
          {isLogin ? "还没有账号？" : "已经有账号了？"}
          <Link href={isLogin ? "/register" : "/login"} className="ml-1 font-medium text-sakura-600 hover:underline">
            {isLogin ? "注册" : "登录"}
          </Link>
        </p>
      </div>
    </main>
  );
}
