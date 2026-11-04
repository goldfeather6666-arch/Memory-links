import { redirect } from "next/navigation";
import { getCurrentSession } from "@/server/auth/session";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/signin");

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-soft-white">Settings</h1>
        <p className="mt-1 text-sm text-slate">Manage your account and preferences.</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Your account details.</CardDescription>
        </CardHeader>
        <div className="flex items-center gap-4">
          <Avatar name={session.displayName || session.email} src={session.avatarUrl} size="lg" />
          <div>
            <p className="font-medium text-soft-white">{session.displayName || "—"}</p>
            <p className="text-sm text-slate">{session.email}</p>
            <p className="text-xs text-slate/70">{session.emailVerified ? "Verified" : "Not verified"}</p>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Preferences</CardTitle>
          <CardDescription>Workspace and product preferences will appear here.</CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
