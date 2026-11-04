import { getCurrentSession } from "@/server/auth/session";
import { listWorkspacesForUser } from "@/server/data/workspaces";
import { AddMemoryForm } from "@/components/app/memory/add-memory-form";

export default async function NewMemoryPage({
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
        <h1 className="text-2xl font-semibold text-soft-white">Add a memory</h1>
        <p className="mt-2 text-slate">You need a workspace first.</p>
      </div>
    );
  }
  const workspaceMap = workspaces.map((w) => ({ id: w.workspace.id, name: w.workspace.name }));
  const defaultW = sp.workspace && workspaceMap.some((w) => w.id === sp.workspace) ? sp.workspace : undefined;

  return (
    <div className="mx-auto max-w-2xl p-6 lg:p-8">
      <h1 className="text-2xl font-semibold text-soft-white">Add a memory</h1>
      <p className="mt-1 text-sm text-slate">
        The content you add is stored with provenance and queued for AI extraction (when a provider is configured).
      </p>
      <div className="mt-6 rounded-2xl border border-soft-white/10 bg-midnight/30 p-5">
        <AddMemoryForm workspaces={workspaceMap} defaultWorkspaceId={defaultW} />
      </div>
    </div>
  );
}
