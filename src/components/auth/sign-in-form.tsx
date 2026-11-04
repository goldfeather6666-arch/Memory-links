"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resend, setResend] = useState<{
    loading: boolean;
    done: boolean;
    message: string | null;
  }>({ loading: false, done: false, message: null });

  const needsVerification =
    !!error && error.toLowerCase().includes("verify");

  async function handleResend() {
    if (!email.trim()) {
      setResend({ loading: false, done: false, message: "Enter your email first to resend." });
      return;
    }
    setResend({ loading: true, done: false, message: null });
    try {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setResend({ loading: false, done: false, message: data.error ?? "Could not resend." });
        return;
      }
      setResend({
        loading: false,
        done: true,
        message: data.emailSent
          ? "A new verification email was sent. Please check your inbox."
          : "Verification email delivery isn't configured on this environment yet.",
      });
    } catch {
      setResend({ loading: false, done: false, message: "Could not resend. Please try again." });
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Sign-in failed.");
        return;
      }
      const next = searchParams.get("next");
      router.push(next && next.startsWith("/app") ? next : "/app");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h1">Welcome back</CardTitle>
        <CardDescription>Sign in to your MNEMOSYNE workspace.</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div>
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link
              href="/forgot-password"
              className="text-xs text-slate hover:text-soft-white transition-colors"
            >
              Forgot password?
            </Link>
          </div>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-400">{error}</p>
        )}
        {needsVerification && (
          <div className="rounded-md border border-violet/30 bg-violet/5 p-3 text-sm">
            {resend.message ? (
              <p className="text-slate">{resend.message}</p>
            ) : (
              <p className="text-slate">
                Please verify your email to sign in. Haven&apos;t received the confirmation email?
              </p>
            )}
            <Button
              type="button"
              variant="ghost"
              className="mt-2 h-9 px-3 text-xs text-violet"
              loading={resend.loading}
              onClick={handleResend}
              disabled={resend.done}
            >
              {resend.loading ? "Resending…" : resend.done ? "Sent" : "Resend verification email"}
            </Button>
          </div>
        )}
        <Button type="submit" className="w-full" loading={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-slate">
        New here?{" "}
        <Link href="/signup" className="text-violet hover:text-soft-white transition-colors">
          Create an account
        </Link>
      </p>
    </Card>
  );
}
