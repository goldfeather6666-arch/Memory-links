"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/app/icons";

const STORAGE_KEY = "mn-onboarding-dismissed";
const RESTART_EVENT = "mn-onboarding-restart";

/** Clear the dismissal so the tour shows again on the next render. */
export function clearOnboardingTour() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // storage unavailable; still try to surface the tour
  }
  window.dispatchEvent(new Event(RESTART_EVENT));
}

const TOUR_LINKS = [
  { href: "/app/vault", label: "Vault", icon: "vault" as const },
  { href: "/app/graph", label: "Graph", icon: "graph" as const },
  { href: "/app/timeline", label: "Timeline", icon: "timeline" as const },
  { href: "/app/projects", label: "Projects", icon: "projects" as const },
  { href: "/app/chat", label: "Chat", icon: "chat" as const },
  { href: "/app/intelligence", label: "Intelligence", icon: "spark" as const },
  { href: "/app/bridge", label: "Bridge", icon: "bridge" as const },
];

/**
 * Dismissible (localStorage) and restartable onboarding welcome card rendered on
 * the command center for demo workspaces.
 */
export function OnboardingTour() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = window.localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      // ignore storage errors; default to showing the tour
    }
    setVisible(!dismissed);

    const onRestart = () => setVisible(true);
    window.addEventListener(RESTART_EVENT, onRestart);
    return () => window.removeEventListener(RESTART_EVENT, onRestart);
  }, []);

  function skip() {
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // ignore storage errors
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle as="h2">Your intelligence universe is ready</CardTitle>
            <CardDescription className="mt-1">
              Explore your memory engine across every surface.
            </CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={skip}>
            Skip
          </Button>
        </div>
      </CardHeader>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {TOUR_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="group flex items-center gap-2 rounded-xl border border-soft-white/10 px-3 py-2.5 text-sm text-soft-white transition-colors hover:bg-soft-white/5"
          >
            <Icon name={link.icon} size={16} className="text-violet" />
            {link.label}
          </Link>
        ))}
      </div>
    </Card>
  );
}
