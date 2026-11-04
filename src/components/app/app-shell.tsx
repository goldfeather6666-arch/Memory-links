"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import Link from "next/link";
import { APP_NAV } from "@/lib/app-nav";
import { Icon } from "@/components/app/icons";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/utils/cn";

interface AppShellProps {
  session: {
    id: string;
    email: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
  children: React.ReactNode;
}

export function AppShell({ session, children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const isActive = useCallback(
    (href: string) => (href === "/app" ? pathname === "/app" : pathname.startsWith(href)),
    [pathname],
  );

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await fetch("/api/auth/signout", { method: "POST" });
    } finally {
      router.push("/signin");
      router.refresh();
    }
  };

  const navList = (
    <nav aria-label="Primary" className="flex flex-1 flex-col gap-1 py-2">
      {APP_NAV.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          onClick={() => setDrawerOpen(false)}
          aria-current={isActive(item.href) ? "page" : undefined}
          className={cn(
            "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
            isActive(item.href)
              ? "bg-violet/15 text-soft-white"
              : "text-slate hover:bg-soft-white/5 hover:text-soft-white",
          )}
        >
          <Icon
            name={item.icon}
            size={18}
            className={cn(isActive(item.href) ? "text-violet" : "text-slate group-hover:text-soft-white")}
          />
          <span>{item.label}</span>
        </Link>
      ))}
    </nav>
  );

  const userSection = (
    <div className="border-t border-soft-white/10 p-3">
      <div className="relative">
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-soft-white/5"
        >
          <Avatar name={session.displayName || session.email} src={session.avatarUrl} size="sm" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-soft-white">
              {session.displayName || session.email}
            </span>
            <span className="block truncate text-xs text-slate">{session.email}</span>
          </span>
          <Icon name="menu" size={16} className="text-slate" />
        </button>
        {menuOpen && (
          <div
            role="menu"
            className="absolute bottom-full left-0 mb-2 w-full rounded-xl glass p-1 shadow-xl"
          >
            <Link
              href="/app/settings"
              role="menuitem"
              onClick={() => setMenuOpen(false)}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate hover:bg-soft-white/5 hover:text-soft-white"
            >
              <Icon name="settings" size={16} /> Settings
            </Link>
            <button
              type="button"
              role="menuitem"
              onClick={handleSignOut}
              disabled={signingOut}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-400 hover:bg-red-500/10"
            >
              <Icon name="logout" size={16} />
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-obsidian">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-soft-white/10 bg-midnight/40 lg:flex">
        <div className="flex items-center gap-2 px-5 py-4">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet/20 text-violet">
            <Icon name="spark" size={18} />
          </span>
          <span className="text-sm font-semibold tracking-wide text-soft-white">MNEMOSYNE</span>
        </div>
        {navList}
        {userSection}
      </aside>

      {/* Mobile top bar */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-soft-white/10 bg-obsidian/80 px-4 py-3 backdrop-blur lg:hidden">
          <button
            type="button"
            aria-label={drawerOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen((o) => !o)}
            className="rounded-lg p-2 text-slate hover:bg-soft-white/5 hover:text-soft-white"
          >
            <Icon name={drawerOpen ? "close" : "menu"} size={20} />
          </button>
          <span className="text-sm font-semibold text-soft-white">MNEMOSYNE</span>
          <div className="w-9" />
        </header>

        {drawerOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div
              className="absolute inset-0 bg-black/60"
              onClick={() => setDrawerOpen(false)}
              aria-hidden="true"
            />
            <div className="absolute left-0 top-0 flex h-full w-72 flex-col bg-midnight border-r border-soft-white/10">
              <div className="flex items-center justify-between px-5 py-4">
                <span className="flex items-center gap-2 text-sm font-semibold text-soft-white">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet/20 text-violet">
                    <Icon name="spark" size={18} />
                  </span>
                  MNEMOSYNE
                </span>
                <button
                  type="button"
                  aria-label="Close navigation"
                  onClick={() => setDrawerOpen(false)}
                  className="rounded-lg p-2 text-slate hover:bg-soft-white/5"
                >
                  <Icon name="close" size={18} />
                </button>
              </div>
              {navList}
              {userSection}
            </div>
          </div>
        )}

        <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
