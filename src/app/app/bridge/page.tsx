import { getCurrentSession } from "@/server/auth/session";
import { listWorkspacesForUser } from "@/server/data/workspaces";
import { listAgents } from "@/server/agent/registry";
import type { Agent } from "@/server/agent/types";
import { BridgeDashboard } from "@/components/app/bridge/bridge-dashboard";
import { EmptyState } from "@/components/ui/empty-state";

export const dynamic = "force-dynamic";

export default async function BridgePage() {
  const session = await getCurrentSession();
  if (!session) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <EmptyState
          icon={<span className="text-3xl">🔌</span>}
          title="Sign in to manage your agent bridge"
          description="Agents are workspace-scoped and private."
        />
      </div>
    );
  }

  const workspaces = await listWorkspacesForUser(session.id);
  if (!workspaces.length) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <EmptyState
          icon={<span className="text-3xl">🗂️</span>}
          title="Create a workspace"
          description="You need a workspace before you can connect agents."
        />
      </div>
    );
  }

  const workspaceId = workspaces[0].workspace.id;

  let agents: Agent[] = [];
  try {
    agents = await listAgents(session.id, workspaceId);
  } catch {
    agents = [];
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-soft-white">Agent Bridge</h1>
        <p className="mt-1 text-sm text-slate">
          Connect external AI agents to Mnemosyne with scoped credentials, granular permissions and audit.
        </p>
      </div>
      <BridgeDashboard initialAgents={agents} workspaceId={workspaceId} />
    </div>
  );
}
