import { verifyEmail } from "@/server/auth/service";
import Link from "next/link";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Verification link invalid</CardTitle>
          <CardDescription>This link is missing its verification token.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const result = await verifyEmail(token);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{result.ok ? "Email verified" : "Verification failed"}</CardTitle>
        <CardDescription>
          {result.ok
            ? "Your email is confirmed. You can now sign in."
            : result.error ?? "This verification link is invalid or expired."}
        </CardDescription>
      </CardHeader>
      <Link href="/signin" className="inline-flex h-10 items-center justify-center rounded-xl bg-violet text-soft-white hover:bg-violet/85 px-4 text-sm font-medium transition-colors">
        Go to sign in
      </Link>
    </Card>
  );
}
