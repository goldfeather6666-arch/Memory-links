import { SignUpForm } from "@/components/auth/sign-up-form";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Create account | MNEMOSYNE",
};

export default function SignUpPage() {
  return <SignUpForm />;
}
