"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/app/icons";
import { DemoBadge } from "@/components/app/demo-badge";

/**
 * Subtle, dismissible banner shown on demo workspaces. "Reset demo" posts to
 * /api/demo/reset (the demo lifecycle endpoint) and then refreshes the route so
 * the workspace reflects the reset state.
 */
export function DemoBanner() {
  const router = useRouter();
  const [dismissed, setDismissed] = useState(false);
  const [resetting, setResetting] = useState(false);

  if (dismissed) return null;

  async function handleReset() {
    setResetting(true);
    try {
      await fetch("/api/demo/reset", { method: "POST" });
    } catch {
      // best-effort: still refresh so the UI reflects current state
    } finally {
      setResetting(false);
      router.refresh();
    }
  }

  return (
    <div className="relative rounded-xl border border-soft-white/10 bg-midnight/40 p-4 pr-11">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet/20 text-violet">
          <Icon name="spark" size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-soft-white">
            You&apos;re exploring sample data…
            <DemoBadge />
          </p>
          <p className="mt-1 text-xs text-slate">
            This workspace contains example memories you can browse, edit, or replace with your own.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/app/vault/new"
            className="inline-flex h-9 items-center justify-center gap-2 rounded-xl bg-violet px-3 text-sm font-medium text-soft-white hover:bg-violet/85"
          >
            <Icon name="plus" size={16} /> Add my first memory
          </Link>
          <Link
            href="/app/projects"
            className="inline-flex h-9 items-center justify-center rounded-xl glass px-3 text-sm font-medium text-soft-white hover:bg-soft-white/10"
          >
            Create my first project
          </Link>
          <Button variant="ghost" size="sm" onClick={handleReset} loading={resetting}>
            Reset demo
          </Button>
        </div>
      </div>
      <button
        type="button"
        aria-label="Dismiss demo banner"
        onClick={() => setDismissed(true)}
        className="absolute right-2.5 top-2.5 rounded-lg p-1.5 text-slate transition-colors hover:bg-soft-white/5 hover:text-soft-white"
      >
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}
