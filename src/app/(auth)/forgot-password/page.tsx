import { mailEnabled } from "@/lib/mail";
import { ForgotForm } from "./forgot-form";

export const metadata = { title: "忘记密码" };
export const dynamic = "force-dynamic";

export default function ForgotPasswordPage() {
  return <ForgotForm mail={mailEnabled()} />;
}
