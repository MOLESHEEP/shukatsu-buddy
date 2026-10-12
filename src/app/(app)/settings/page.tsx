import { requireUser } from "@/lib/auth";
import { providerLabel } from "@/lib/llm/provider";
import { quotaInfo } from "@/lib/quota";
import { PageHeader } from "@/components/ui";
import { SettingsForm } from "./settings-form";

export const metadata = { title: "设置" };

export default async function SettingsPage() {
  const user = await requireUser();
  const base = (process.env.PUBLIC_URL || "http://localhost:3000").replace(/\/$/, "");
  return (
    <>
      <PageHeader emoji="⚙️" title="设置" />
      <SettingsForm
        user={{ display_name: user.display_name, email: user.email, grad_year: user.grad_year, major: user.major, jp_level: user.jp_level, plan: user.plan, career_stage: user.career_stage }}
        icsUrl={`${base}/api/ics/${user.ics_token}.ics`}
        provider={providerLabel()}
        quota={quotaInfo(user)}
      />
    </>
  );
}
