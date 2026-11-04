import type { IconName } from "@/components/app/icons";

export interface AppNavItem {
  href: string;
  label: string;
  description: string;
  icon: IconName;
}

export const APP_NAV: AppNavItem[] = [
  { href: "/app", label: "Command Center", description: "Overview of your memory workspace", icon: "command" },
  { href: "/app/vault", label: "Memory Vault", description: "Browse and manage memory records", icon: "vault" },
  { href: "/app/graph", label: "Knowledge Graph", description: "See relationships across memories", icon: "graph" },
  { href: "/app/timeline", label: "Timeline", description: "Replay events over time", icon: "timeline" },
  { href: "/app/projects", label: "Projects", description: "Organize work into projects", icon: "projects" },
  { href: "/app/documents", label: "Documents", description: "Import and manage source material", icon: "documents" },
  { href: "/app/chat", label: "AI Chat", description: "Ask Your Past — grounded conversations with your memories", icon: "chat" },
  { href: "/app/bridge", label: "Agent Bridge", description: "Connect external agents (Part 3)", icon: "bridge" },
  { href: "/app/processing", label: "Processing Center", description: "Track and retry memory jobs", icon: "activity" },
  { href: "/app/intelligence", label: "Intelligence", description: "Autonomous analysis", icon: "spark" },
  { href: "/app/settings", label: "Settings", description: "Manage your account and preferences", icon: "settings" },
];

export function navItemByHref(href: string): AppNavItem | undefined {
  return APP_NAV.find((i) => i.href === href);
}
