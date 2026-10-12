import { checkResetToken } from "@/lib/password-reset";
import { ResetForm } from "./reset-form";

export const metadata = { title: "设置新密码" };
export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const token = (await searchParams).token ?? "";
  const info = token ? await checkResetToken(token) : null;
  // Show only a masked email so a leaked link reveals as little as possible.
  const masked = info ? info.email.replace(/^(.{2}).*(@.*)$/, "$1•••$2") : null;
  return <ResetForm token={token} email={masked} />;
}
