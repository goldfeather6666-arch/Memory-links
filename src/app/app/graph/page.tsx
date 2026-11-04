import { getCurrentSession } from "@/server/auth/session";
import { listWorkspacesForUser } from "@/server/data/workspaces";
import { getGraphMetrics, type GraphMetrics } from "@/server/intelligence/graph";
import { GraphExplorer } from "@/components/app/graph/graph-explorer";
import { EmptyState } from "@/components/ui/empty-state";
import { DemoBanner } from "@/components/app/demo-banner";

export const dynamic = "force-dynamic";

export default async function GraphPage({
  searchParams,
}: {
  searchParams: Promise<{ workspace?: string }>;
}) {
  const { workspace } = await searchParams;
  const session = await getCurrentSession();
  if (!session) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <EmptyState
          icon={<span className="text-3xl">🤖</span>}
          title="Sign in to view your knowledge graph"
          description="Your graph is workspace-scoped and private."
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
          description="You need a workspace before you can explore your knowledge graph."
        />
      </div>
    );
  }

  const active =
    workspaces.find((w) => w.workspace.id === workspace) ?? workspaces[0];
  const workspaceId = active.workspace.id;
  const isDemo = active.workspace.settings?.is_demo === true;

  let metrics: GraphMetrics | null = null;
  try {
    metrics = await getGraphMetrics(session.id, workspaceId);
  } catch {
    metrics = null;
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      {isDemo && <DemoBanner />}
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold text-soft-white">Knowledge Graph</h1>
          <p className="text-sm text-slate">
            Explore how your memories, projects, people and ideas connect.
          </p>
        </div>
        <p className="text-sm text-slate">{active.workspace.name}</p>
      </div>
      <GraphExplorer workspaceId={workspaceId} initialMetrics={metrics} />
    </div>
  );
}
