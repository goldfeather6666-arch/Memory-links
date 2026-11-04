import { Suspense } from "react";
import { SignInForm } from "@/components/auth/sign-in-form";
import { Spinner } from "@/components/ui/button";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign in | MNEMOSYNE",
};

export default function SignInPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20"><Spinner /></div>}>
      <SignInForm />
    </Suspense>
  );
}
