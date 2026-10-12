import { Suspense } from "react";
import { signupStatus } from "@/lib/signup";
import { AuthForm } from "../auth-form";

export const metadata = { title: "注册" };
export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  const signup = await signupStatus();
  return (
    <Suspense>
      <AuthForm mode="register" signup={signup} />
    </Suspense>
  );
}
