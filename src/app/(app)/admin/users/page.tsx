import { listUsers } from "@/lib/admin";
import { getLlmSettings } from "@/lib/settings";
import { getDefaultLimits } from "@/lib/quota";
import { requireAdmin } from "@/lib/auth";
import { Input, Select } from "@/components/ui";
import { UsersTable } from "./users-table";

export default async function AdminUsers({ searchParams }: { searchParams: Promise<{ q?: string; filter?: string }> }) {
  const me = await requireAdmin();
  const sp = await searchParams;
  const [users, settings, limits] = await Promise.all([listUsers(sp.q?.trim() ?? "", sp.filter ?? ""), getLlmSettings(), getDefaultLimits()]);
  return (
    <div className="space-y-4">
      <form className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_auto_auto]">
        <Input name="q" defaultValue={sp.q} placeholder="搜索用户 ID、邮箱或名字" className="col-span-2 sm:col-span-1" />
        <Select name="filter" defaultValue={sp.filter ?? ""} className="w-auto">
          <option value="">全部用户</option>
          <option value="ai_off">未开通 AI</option>
          <option value="ai_on">已开通 AI</option>
          <option value="banned">已停用</option>
          <option value="admin">管理员</option>
        </Select>
        <button className="rounded-xl bg-paper px-4 py-2.5 text-sm font-medium shadow-[var(--shadow-soft)] hover:bg-stone-50">筛选</button>
      </form>
      <p className="text-xs text-muted">
        新用户 AI 默认：<b>{settings.aiDefaultEnabled ? "开启" : "关闭"}</b> · 每日默认额度：ES {limits.es} 次 / 邮件助手 {limits.email} 次 / 经验整理 {limits.post} 次（可在「AI 与额度」修改）。
        管理员不受 AI 开关和额度限制。
      </p>
      <UsersTable users={users} meId={me.id} defaults={{ ai: settings.aiDefaultEnabled, ...limits }} />
    </div>
  );
}
