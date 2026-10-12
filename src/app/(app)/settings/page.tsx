import { requireUser } from "@/lib/auth";
import { isDemoMode } from "@/lib/llm/provider";
import { allProviders, providerChain } from "@/lib/llm/providers";
import { quotaInfo } from "@/lib/quota";
import { PageHeader } from "@/components/ui";
import { SettingsForm } from "./settings-form";
import { AiProviders, type ProviderStatus } from "./ai-providers";

export const metadata = { title: "设置" };

export default async function SettingsPage() {
  const user = await requireUser();
  const base = (process.env.PUBLIC_URL || "http://localhost:3000").replace(/\/$/, "");
  const chain = providerChain().map((p) => p.id);
  // Never send keys to the browser: only names, models and readiness.
  const providers: ProviderStatus[] = allProviders().map((p) => ({
    id: p.id,
    label: p.label,
    vendor: p.vendor,
    model: p.model,
    baseUrl: p.baseUrl,
    configured: p.configured,
    missing: p.missing,
    keyEnv: p.keyEnvs[0],
    note: p.note,
    consoleUrl: p.consoleUrl,
    role: chain[0] === p.id ? "primary" : chain.includes(p.id) ? "fallback" : null,
  }));
  return (
    <>
      <PageHeader emoji="⚙️" title="设置" />
      <SettingsForm
        user={{ display_name: user.display_name, email: user.email, grad_year: user.grad_year, major: user.major, jp_level: user.jp_level, plan: user.plan, career_stage: user.career_stage }}
        icsUrl={`${base}/api/ics/${user.ics_token}.ics`}
        aiPanel={<AiProviders providers={providers} demo={isDemoMode()} />}
        quota={quotaInfo(user)}
      />
    </>
  );
}
