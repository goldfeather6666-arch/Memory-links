import { Suspense } from "react";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { Spinner } from "@/components/ui/button";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Reset password | MNEMOSYNE",
};

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20"><Spinner /></div>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
