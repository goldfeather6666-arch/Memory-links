import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/server/auth/session";
import { AppShell } from "@/components/app/app-shell";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await getCurrentSession();
  if (!session) {
    redirect("/signin");
  }

  return (
    <AppShell
      session={{
        id: session.id,
        email: session.email,
        displayName: session.displayName,
        avatarUrl: session.avatarUrl,
      }}
    >
      {children}
    </AppShell>
  );
}
