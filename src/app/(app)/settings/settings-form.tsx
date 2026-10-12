"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, LogOut } from "lucide-react";
import { Button, Card, ErrorNote, Field, Input, Select } from "@/components/ui";
import { api, errMsg } from "@/lib/client";

type Props = {
  user: { display_name: string; email: string; grad_year: number | null; major: string; jp_level: string; plan: string };
  icsUrl: string;
  provider: string;
  quota: { enforced: boolean; es: { used: number; limit: number }; email: { used: number; limit: number } };
};

export function SettingsForm({ user, icsUrl, provider, quota }: Props) {
  const router = useRouter();
  const [form, setForm] = useState({ display_name: user.display_name, grad_year: user.grad_year ? String(user.grad_year) : "", major: user.major, jp_level: user.jp_level });
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save() {
    setError(null);
    try {
      await api("/api/me", { method: "PATCH", body: { ...form, grad_year: form.grad_year ? Number(form.grad_year) : null } });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
      router.refresh();
    } catch (e) {
      setError(errMsg(e));
    }
  }
  async function wipe(scope: "data" | "account") {
    const msg = scope === "data" ? "删除全部公司、日程、邮件和 ES 记录？此操作不可恢复。" : "注销账号并删除所有数据？此操作不可恢复。";
    if (!confirm(msg)) return;
    await api(`/api/me?scope=${scope}`, { method: "DELETE" });
    router.push(scope === "account" ? "/" : "/dashboard");
    router.refresh();
  }
  async function logout() {
    await api("/api/auth/logout", { method: "POST", body: {} });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="grid max-w-4xl gap-6 lg:grid-cols-2">
      <Card className="space-y-4">
        <h2 className="font-semibold">个人信息</h2>
        <p className="-mt-2 text-xs text-muted">ES 添削时 AI 会参考这些背景。</p>
        <Field label="名字">
          <Input value={form.display_name} onChange={set("display_name")} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="毕业年份">
            <Input type="number" placeholder="2028" value={form.grad_year} onChange={set("grad_year")} />
          </Field>
          <Field label="日语水平">
            <Select value={form.jp_level} onChange={set("jp_level")}>
              <option value="">未填写</option>
              {["N1", "N2", "N3", "BJT J1+", "BJT J1", "BJT J2", "母语级"].map((l) => (
                <option key={l}>{l}</option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="专业">
          <Input value={form.major} onChange={set("major")} placeholder="例：情報工学 / 経済学" />
        </Field>
        <ErrorNote message={error} />
        <Button onClick={save}>{saved ? "已保存 ✓" : "保存"}</Button>
      </Card>

      <div className="space-y-6">
        <Card id="calendar" className="scroll-mt-6 space-y-3">
          <h2 className="font-semibold">📅 日历订阅 & 提醒</h2>
          <p className="text-sm text-muted">
            把这个链接添加到 iPhone 日历 / Google 日历（"通过 URL 订阅"），所有截止日和面试会同步过去，并在
            <b className="text-ink">截止前 3 天、1 天</b>和<b className="text-ink">面试前一晚</b>自动提醒。
          </p>
          <div className="flex gap-2">
            <Input readOnly value={icsUrl} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
            <Button
              variant="soft"
              onClick={async () => {
                await navigator.clipboard.writeText(icsUrl);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            </Button>
          </div>
          <button
            className="text-xs text-muted hover:text-sakura-600"
            onClick={async () => {
              if (!confirm("重置后旧链接会失效，需要重新订阅。继续？")) return;
              await api("/api/me", { method: "PATCH", body: { rotate_ics: true } });
              router.refresh();
            }}
          >
            链接泄露了？重置链接
          </button>
        </Card>

        <Card className="space-y-2">
          <h2 className="font-semibold">AI 与额度</h2>
          <p className="text-sm">
            <span className="text-muted">当前引擎：</span>
            {provider}
          </p>
          <p className="text-sm">
            <span className="text-muted">已使用：</span>ES 添削 {quota.es.used} 次 · 邮件识别 {quota.email.used} 次
            {quota.enforced && <span className="text-muted">（免费版上限 {quota.es.limit} / {quota.email.limit}）</span>}
          </p>
        </Card>

        <Card className="space-y-3">
          <h2 className="font-semibold">隐私与账号</h2>
          <p className="text-sm text-muted">{user.email}</p>
          <p className="text-xs text-muted">邮件原文和 ES 内容只用于为你生成结果，不用于公开汇总。</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" size="sm" onClick={logout}>
              <LogOut className="size-4" /> 退出登录
            </Button>
            <Button variant="danger" size="sm" onClick={() => wipe("data")}>
              一键删除全部数据
            </Button>
            <Button variant="danger" size="sm" onClick={() => wipe("account")}>
              注销账号
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
