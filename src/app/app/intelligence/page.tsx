import { getCurrentSession } from "@/server/auth/session";
import { listWorkspacesForUser } from "@/server/data/workspaces";
import { getIntelligenceDashboard } from "@/server/intelligence/dashboard";
import { getProcessingSettings } from "@/server/intelligence/settings";
import { listContradictions } from "@/server/intelligence/contradictions";
import { listSuggestions } from "@/server/intelligence/suggestions";
import { listPatterns } from "@/server/intelligence/patterns";
import { listConsolidations } from "@/server/intelligence/consolidation";
import { IntelligencePanel } from "@/components/app/intelligence/intelligence-panel";

export const dynamic = "force-dynamic";

export default async function IntelligencePage({
  searchParams,
}: {
  searchParams: Promise<{ workspace?: string }>;
}) {
  const sp = await searchParams;
  const session = await getCurrentSession();
  if (!session) {
    return <p className="p-8 text-soft-white">You must be signed in.</p>;
  }

  const workspaces = await listWorkspacesForUser(session.id);
  if (workspaces.length === 0) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-semibold text-soft-white">Intelligence</h1>
        <p className="mt-2 text-slate">Create a workspace to start analyzing memories.</p>
      </div>
    );
  }

  const active =
    workspaces.find((w) => w.workspace.id === sp.workspace)?.workspace ?? workspaces[0].workspace;
  const workspaceId = active.id;

  const [dashboard, settings, contradictions, suggestions, patterns, consolidations] =
    await Promise.all([
      getIntelligenceDashboard(session.id, workspaceId),
      getProcessingSettings(session.id, workspaceId),
      listContradictions(session.id, workspaceId, { onlyUnresolved: true }),
      listSuggestions(session.id, workspaceId, { status: "pending", limit: 50 }),
      listPatterns(session.id, workspaceId),
      listConsolidations(session.id, workspaceId, { limit: 50 }),
    ]);

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-soft-white">Intelligence</h1>
        <p className="text-sm text-slate">
          Autonomous memory analysis · {active.name}
        </p>
      </div>
      <IntelligencePanel
        workspaceId={workspaceId}
        dashboard={dashboard}
        settings={settings}
        contradictions={contradictions}
        suggestions={suggestions}
        patterns={patterns}
        consolidations={consolidations}
      />
    </div>
  );
}
