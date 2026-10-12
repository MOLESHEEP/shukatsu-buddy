"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, Check, Copy, Plus, Trash2 } from "lucide-react";
import { Badge, Button, Card, EmptyState, ErrorNote, Field, Input, cx } from "@/components/ui";
import { api, errMsg } from "@/lib/client";

type Settings = { mode: "open" | "invite" | "closed"; maxUsers: number | null; dailyMax: number | null; perIpDaily: number | null; message: string };
export type InviteRow = {
  code: string;
  note: string;
  max_uses: number | null;
  uses: number;
  expires_at: string | null;
  disabled: boolean;
  created_at: string;
  used_by: string[];
};

const num = (v: string) => (v.trim() === "" ? null : Math.max(0, Math.floor(Number(v))));

export function SignupAdmin({ initial, stats, invites, registerUrl }: { initial: Settings; stats: { users: number; today: number; week: number }; invites: InviteRow[]; registerUrl: string }) {
  const router = useRouter();
  const [s, setS] = useState({
    mode: initial.mode,
    maxUsers: initial.maxUsers?.toString() ?? "",
    dailyMax: initial.dailyMax?.toString() ?? "",
    perIpDaily: initial.perIpDaily?.toString() ?? "",
    message: initial.message,
  });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    try {
      await api("/api/admin/signup", {
        method: "PUT",
        body: { mode: s.mode, maxUsers: num(s.maxUsers), dailyMax: num(s.dailyMax), perIpDaily: num(s.perIpDaily), message: s.message },
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      router.refresh();
    } catch (e) {
      setError(errMsg(e));
    }
  }

  const modes = [
    { k: "open" as const, label: "开放注册", desc: "任何人都可以注册（仍受下面的数量限制）" },
    { k: "invite" as const, label: "仅限邀请码", desc: "必须填写有效的邀请码才能注册" },
    { k: "closed" as const, label: "关闭注册", desc: "暂停所有新注册，已有用户不受影响" },
  ];
  const max = num(s.maxUsers);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "用户数", value: max != null ? `${stats.users} / ${max}` : stats.users, tone: max != null && stats.users >= max ? "bg-sakura-50 text-sakura-700" : "bg-sky-50 text-sky-700" },
          { label: "近 24 小时注册", value: s.dailyMax ? `${stats.today} / ${s.dailyMax}` : stats.today, tone: "bg-mint-50 text-mint-700" },
          { label: "近 7 天注册", value: stats.week, tone: "bg-violet-50 text-violet-700" },
        ].map((t) => (
          <div key={t.label} className={`rounded-[var(--radius-card)] p-4 ${t.tone}`}>
            <div className="text-2xl font-bold tabular-nums">{t.value}</div>
            <div className="text-xs opacity-80">{t.label}</div>
          </div>
        ))}
      </div>

      <Card className="space-y-4">
        <h2 className="font-semibold">注册规则</h2>
        <div className="grid gap-2 sm:grid-cols-3">
          {modes.map((m) => (
            <button
              key={m.k}
              type="button"
              onClick={() => setS({ ...s, mode: m.k })}
              className={cx("rounded-2xl border p-3 text-left transition", s.mode === m.k ? "border-sakura-300 bg-sakura-50" : "border-line hover:bg-stone-50")}
            >
              <div className={cx("text-sm font-medium", s.mode === m.k && "text-sakura-700")}>{m.label}</div>
              <div className="mt-0.5 text-xs text-muted">{m.desc}</div>
            </button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="用户总数上限" hint="留空 = 不限">
            <Input type="number" min={0} value={s.maxUsers} onChange={(e) => setS({ ...s, maxUsers: e.target.value })} placeholder="不限" />
          </Field>
          <Field label="每 24 小时最多注册" hint="全站">
            <Input type="number" min={0} value={s.dailyMax} onChange={(e) => setS({ ...s, dailyMax: e.target.value })} placeholder="不限" />
          </Field>
          <Field label="同一 IP 每 24 小时最多" hint="防批量注册">
            <Input type="number" min={0} value={s.perIpDaily} onChange={(e) => setS({ ...s, perIpDaily: e.target.value })} placeholder="不限" />
          </Field>
        </div>
        <Field label="暂停 / 满额时显示的提示" hint="可选">
          <Input value={s.message} maxLength={300} onChange={(e) => setS({ ...s, message: e.target.value })} placeholder="例：内测名额已满，正式开放时会在小红书通知～" />
        </Field>
        <p className="text-xs text-muted">IP 只以加密哈希保存，用于计数，无法还原成真实地址。管理员邮箱（ADMIN_EMAILS）不受这些限制。注册表单还内置了防机器人的隐藏字段。</p>
        <ErrorNote message={error} />
        <Button onClick={save}>{saved ? "已保存 ✓ 立即生效" : "保存"}</Button>
      </Card>

      <Invites invites={invites} registerUrl={registerUrl} inviteMode={initial.mode === "invite"} />
    </div>
  );
}

function Invites({ invites, registerUrl, inviteMode }: { invites: InviteRow[]; registerUrl: string; inviteMode: boolean }) {
  const router = useRouter();
  const [form, setForm] = useState({ count: "5", max_uses: "1", expires_days: "30", note: "" });
  const [fresh, setFresh] = useState<string[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ codes: string[] }>("/api/admin/signup", {
        body: { count: Number(form.count) || 1, max_uses: num(form.max_uses), expires_days: num(form.expires_days), note: form.note },
      });
      setFresh(r.codes);
      router.refresh();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }
  async function copy(text: string, key: string) {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  }
  async function act(code: string, kind: "toggle" | "delete", disabled?: boolean) {
    if (kind === "delete" && !confirm(`删除邀请码 ${code}？已用它注册的账号不受影响。`)) return;
    await api(`/api/admin/invites/${encodeURIComponent(code)}`, kind === "delete" ? { method: "DELETE" } : { method: "PATCH", body: { disabled: !disabled } });
    router.refresh();
  }
  const link = (code: string) => `${registerUrl}?invite=${code}`;
  const now = Date.now();

  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">邀请码</h2>
        {!inviteMode && <span className="text-xs text-muted">当前不是「仅限邀请码」模式，邀请码暂时用不上（但可以提前生成）</span>}
      </div>
      <div className="grid gap-2 sm:grid-cols-[repeat(3,minmax(0,1fr))_2fr_auto] sm:items-end">
        <Field label="生成数量">
          <Input type="number" min={1} max={100} value={form.count} onChange={(e) => setForm({ ...form, count: e.target.value })} />
        </Field>
        <Field label="每个可用次数" hint="空 = 不限">
          <Input type="number" min={1} value={form.max_uses} onChange={(e) => setForm({ ...form, max_uses: e.target.value })} placeholder="不限" />
        </Field>
        <Field label="有效天数" hint="空 = 永久">
          <Input type="number" min={1} value={form.expires_days} onChange={(e) => setForm({ ...form, expires_days: e.target.value })} placeholder="永久" />
        </Field>
        <Field label="备注">
          <Input value={form.note} maxLength={60} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="例：早稻田留学生群" />
        </Field>
        <Button onClick={create} loading={busy}>
          <Plus className="size-4" /> 生成
        </Button>
      </div>
      <ErrorNote message={error} />
      {fresh.length > 0 && (
        <div className="rounded-2xl bg-mint-50 p-3 text-sm text-mint-700">
          <div className="flex items-center justify-between">
            <span>已生成 {fresh.length} 个邀请码</span>
            <button className="text-xs underline" onClick={() => copy(fresh.map(link).join("\n"), "all")}>
              {copied === "all" ? "已复制 ✓" : "复制全部注册链接"}
            </button>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5 font-mono">
            {fresh.map((c) => (
              <span key={c} className="rounded bg-paper px-1.5 py-0.5">
                {c}
              </span>
            ))}
          </div>
        </div>
      )}

      {invites.length === 0 ? (
        <EmptyState title="还没有邀请码" />
      ) : (
        <ul className="divide-y divide-line">
          {invites.map((i) => {
            const expired = i.expires_at && new Date(i.expires_at).getTime() < now;
            const full = i.max_uses != null && i.uses >= i.max_uses;
            const state = i.disabled ? { t: "已停用", tone: "stone" } : expired ? { t: "已过期", tone: "stone" } : full ? { t: "已用完", tone: "lemon" } : { t: "可用", tone: "mint" };
            return (
              <li key={i.code} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3 text-sm">
                <code className="rounded-lg bg-stone-50 px-2 py-1 font-mono font-semibold">{i.code}</code>
                <Badge tone={state.tone}>{state.t}</Badge>
                <span className="text-xs text-muted">
                  已用 {i.uses}
                  {i.max_uses != null ? ` / ${i.max_uses}` : " / 不限"}
                  {i.expires_at ? ` · ${new Date(i.expires_at).toLocaleDateString("zh-CN")} 到期` : " · 永久"}
                  {i.note && ` · ${i.note}`}
                </span>
                <div className="ml-auto flex items-center gap-1">
                  <button onClick={() => copy(link(i.code), i.code)} className="rounded-lg p-1.5 text-muted hover:bg-stone-50" title="复制注册链接">
                    {copied === i.code ? <Check className="size-4" /> : <Copy className="size-4" />}
                  </button>
                  <button onClick={() => act(i.code, "toggle", i.disabled)} className="rounded-lg p-1.5 text-muted hover:bg-stone-50" title={i.disabled ? "启用" : "停用"}>
                    <Ban className={cx("size-4", i.disabled && "text-sakura-500")} />
                  </button>
                  <button onClick={() => act(i.code, "delete")} className="rounded-lg p-1.5 text-muted hover:bg-sakura-50 hover:text-sakura-700" title="删除">
                    <Trash2 className="size-4" />
                  </button>
                </div>
                {i.used_by.length > 0 && <div className="w-full truncate text-xs text-muted">注册用户：{i.used_by.join("、")}</div>}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
