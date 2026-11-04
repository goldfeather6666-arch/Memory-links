"use client";

import { type FormEvent, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/utils/cn";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Status = "idle" | "loading" | "submitted";

export default function WaitlistForm({ className }: { className?: string }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (status === "loading" || status === "submitted") {
      return;
    }

    const value = email.trim();

    if (!value) {
      setError("Please enter your email address.");
      return;
    }

    if (!EMAIL_PATTERN.test(value)) {
      setError("Please enter a valid email address.");
      return;
    }

    setError(null);
    setStatus("loading");

    // Simulated network latency for this frontend-only demo. No request is made.
    window.setTimeout(() => {
      setStatus("submitted");
    }, 400);
  }

  const submitted = status === "submitted";

  return (
    <div className={cn("w-full", className)}>
      <form
        id="waitlist-form"
        data-testid="waitlist-form"
        aria-label="Early access waitlist"
        onSubmit={handleSubmit}
        noValidate
        className="flex w-full flex-col gap-3 sm:flex-row"
      >
        <div className="flex-1">
          <label htmlFor="waitlist-email" className="sr-only">
            Email address
          </label>
          <input
            id="waitlist-email"
            name="email"
            type="email"
            required
            aria-label="Email address"
            aria-invalid={error ? true : undefined}
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={submitted}
            className={cn(
              "glass w-full rounded-full px-5 py-3 text-sm text-soft-white transition-colors outline-none",
              "placeholder:text-slate",
              "disabled:opacity-60",
            )}
          />
        </div>
        <button
          type="submit"
          data-testid="waitlist-submit"
          disabled={status === "loading" || submitted}
          className={cn(
            "inline-flex items-center justify-center gap-2 rounded-full bg-violet px-6 py-3 text-sm font-medium text-soft-white transition-colors",
            "hover:bg-violet/85",
            "disabled:cursor-not-allowed disabled:opacity-70",
          )}
        >
          {status === "loading" ? (
            <>
              <span
                aria-hidden="true"
                className="h-4 w-4 animate-spin rounded-full border-2 border-soft-white/40 border-t-soft-white"
              />
              Signing up…
            </>
          ) : submitted ? (
            "You're on the list"
          ) : (
            "Request early access"
          )}
        </button>
      </form>

      <AnimatePresence mode="wait">
        {submitted ? (
          <motion.p
            key="success"
            data-testid="waitlist-message"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="mt-3 text-sm text-champagne"
          >
            Thanks — you&apos;re on the demo waitlist. We&apos;ll be in touch soon.
          </motion.p>
        ) : error ? (
          <motion.p
            key="error"
            role="alert"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="mt-3 text-sm text-red-400"
          >
            {error}
          </motion.p>
        ) : null}
      </AnimatePresence>

      <p className="mt-2 text-xs text-slate">
        Frontend-only demo — no data is sent or stored.
      </p>
    </div>
  );
}
