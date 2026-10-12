import { Suspense } from "react";
import { AuthForm } from "../auth-form";

export const metadata = { title: "注册" };

export default function RegisterPage() {
  return (
    <Suspense>
      <AuthForm mode="register" />
    </Suspense>
  );
}
