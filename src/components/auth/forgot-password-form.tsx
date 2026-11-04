"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Please enter a valid email.");
        return;
      }
      setDone(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Check your email</CardTitle>
          <CardDescription>
            If an account exists for that address, we sent a password reset link. It expires in 24 hours.
          </CardDescription>
        </CardHeader>
        <Link href="/signin" className="inline-flex h-10 items-center justify-center rounded-xl bg-violet text-soft-white hover:bg-violet/85 px-4 text-sm font-medium transition-colors">
          Back to sign in
        </Link>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Forgot password</CardTitle>
        <CardDescription>Enter your account email and we&apos;ll send you a reset link.</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        </div>
        {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
        <Button type="submit" className="w-full" loading={loading}>
          {loading ? "Sending…" : "Send reset link"}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-slate">
        Remembered it?{" "}
        <Link href="/signin" className="text-violet hover:text-soft-white transition-colors">Sign in</Link>
      </p>
    </Card>
  );
}
