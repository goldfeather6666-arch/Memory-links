import { redirect } from "next/navigation";
import { getCurrentSession } from "@/server/auth/session";
import { listWorkspacesForUser } from "@/server/data/workspaces";
import { listMemoryRecordsInWorkspace } from "@/server/data/memory";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/app/icons";

export const dynamic = "force-dynamic";

export default async function VaultPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/signin");

  const workspaces = await listWorkspacesForUser(session.id);
  if (workspaces.length === 0) {
    return (
      <EmptyState
        icon={<Icon name="vault" size={28} />}
        title="Create a workspace first"
        description="You need a workspace before you can store memory records."
        action={
          <a href="/app" className="inline-flex h-9 items-center justify-center rounded-xl bg-violet px-3 text-sm font-medium text-soft-white hover:bg-violet/85">
            Go to Command Center
          </a>
        }
      />
    );
  }

  const records = await listMemoryRecordsInWorkspace(session.id, workspaces[0].workspace.id);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-soft-white">Memory Vault</h1>
        <p className="mt-1 text-sm text-slate">Browse and manage your memory records.</p>
      </header>
      {records.length === 0 ? (
        <EmptyState
          icon={<Icon name="vault" size={28} />}
          title="No memory records yet"
          description="Recorded memories will appear here. Automatic formation arrives in Part 3."
        />
      ) : (
        <div className="space-y-3">
          {records.map((r) => (
            <Card key={r.id}>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <Badge variant="violet">{r.memoryType}</Badge>
                  <p className="mt-2 text-sm text-soft-white">{r.summary ?? r.content}</p>
                  <p className="mt-1 text-xs text-slate">{formatDate(r.createdAt)}</p>
                </div>
                <Badge variant="subtle">{r.privacyClassification}</Badge>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
