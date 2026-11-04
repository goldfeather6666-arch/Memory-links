import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentSession } from "@/server/auth/session";
import {
  listWorkspacesForUser,
  type WorkspaceWithRole,
} from "@/server/data/workspaces";
import { getMemoryStats } from "@/server/data/memory";
import { listRecentProjectsForUser } from "@/server/data/projects";
import { listAuditEventsForUser } from "@/server/data/audit";
import { APP_NAV } from "@/lib/app-nav";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/app/icons";
import { WorkspaceSwitcher } from "@/components/app/workspace-switcher";
import { NewWorkspaceForm } from "@/components/app/new-workspace-form";

export const dynamic = "force-dynamic";

export default async function CommandCenterPage({
  searchParams,
}: {
  searchParams: Promise<{ ws?: string }>;
}) {
  const session = await getCurrentSession();
  if (!session) redirect("/signin");

  const params = await searchParams;
  const workspaces = await listWorkspacesForUser(session.id);

  if (workspaces.length === 0) {
    return <NoWorkspace />;
  }

  const selected = selectWorkspace(workspaces, params.ws);
  const workspaceId = selected.workspace.id;
  const workspaceName = selected.workspace.name;

  let stats: Awaited<ReturnType<typeof getMemoryStats>> | null = null;
  let projects: Awaited<ReturnType<typeof listRecentProjectsForUser>> = [];
  let activity: Awaited<ReturnType<typeof listAuditEventsForUser>> = [];
  try {
    [stats, projects, activity] = await Promise.all([
      getMemoryStats(session.id, workspaceId),
      listRecentProjectsForUser(session.id, 5),
      listAuditEventsForUser(session.id, 8),
    ]);
  } catch {
    stats = null;
  }


  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-soft-white">
            Welcome back{session.displayName ? `, ${session.displayName}` : ""}
          </h1>
          <p className="mt-1 text-sm text-slate">
            Your command center for <span className="text-soft-white">{workspaceName}</span>.
          </p>
        </div>
        <WorkspaceSwitcher
          workspaces={workspaces.map((w) => ({ id: w.workspace.id, name: w.workspace.name }))}
          current={workspaceId}
        />
      </header>

      {stats !== null && stats.total > 0 ? (
        <MemoryStats stats={stats} />
      ) : (
        <EmptyState
          icon={<Icon name="spark" size={28} />}
          title="No memory records yet"
          description="Your memories will appear here as you import and form them in Part 3."
        />
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent projects</CardTitle>
            <CardDescription>Your latest projects.</CardDescription>
          </CardHeader>
          {projects.length === 0 ? (
            <EmptyState
              title="No projects yet"
              description="Create a project to organize your work in a workspace."
              action={
                <Link href="/app/projects" className="inline-flex h-9 items-center justify-center rounded-xl bg-violet px-3 text-sm font-medium text-soft-white hover:bg-violet/85">
                  Go to projects
                </Link>
              }
            />
          ) : (
            <ul className="space-y-3">
              {projects.map((p) => (
                <li key={p.id}>
                  <Link href="#" className="flex items-center justify-between rounded-xl border border-soft-white/10 px-4 py-3 transition-colors hover:bg-soft-white/5">
                    <span className="font-medium text-soft-white">{p.name}</span>
                    <Badge variant="subtle">{p.status}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
            <CardDescription>Latest events in your account and workspaces.</CardDescription>
          </CardHeader>
          {activity.length === 0 ? (
            <EmptyState
              title="No activity yet"
              description="Sensitive operations are logged here as they happen."
            />
          ) : (
            <ul className="space-y-2">
              {activity.map((a) => (
                <li key={a.id} className="flex items-center gap-3 text-sm">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-violet" />
                  <span className="text-slate">{a.action}</span>
                  <span className="ml-auto text-xs text-slate/60">{formatDate(a.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Quick actions</CardTitle>
        </CardHeader>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {APP_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="group flex items-center gap-3 rounded-xl border border-soft-white/10 px-4 py-3 transition-colors hover:bg-soft-white/5"
            >
              <Icon name={item.icon} size={18} className="text-violet" />
              <span className="text-sm font-medium text-soft-white">{item.label}</span>
              <Icon name="arrow-right" size={16} className="ml-auto text-slate group-hover:text-soft-white" />
            </Link>
          ))}
        </div>
      </Card>
    </div>
  );
}

function selectWorkspace(workspaces: WorkspaceWithRole[], requested?: string) {
  if (requested) {
    const found = workspaces.find((w) => w.workspace.id === requested);
    if (found) return found;
  }
  return workspaces[0];
}

async function NoWorkspace() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Welcome to MNEMOSYNE</CardTitle>
          <CardDescription>
            Create your first workspace to start organizing your memory engine.
          </CardDescription>
        </CardHeader>
        <NewWorkspaceForm />
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Getting started</CardTitle>
          <CardDescription>The foundation is ready. Part 3 adds AI memory formation.</CardDescription>
        </CardHeader>
        <ul className="space-y-2 text-sm text-slate">
          <li>1. Create a workspace.</li>
          <li>2. Add projects and start organizing.</li>
          <li>3. Memory records, relationships and retrieval arrive in Part 3.</li>
        </ul>
      </Card>
    </div>
  );
}

function MemoryStats({ stats }: { stats: NonNullable<Awaited<ReturnType<typeof getMemoryStats>>> }) {
  const types: { key: keyof typeof stats.byType; label: string; icon: React.ComponentProps<typeof Icon>["name"] }[] = [
    { key: "episodic", label: "Episodic", icon: "clock" },
    { key: "semantic", label: "Semantic", icon: "layers" },
    { key: "procedural", label: "Procedural", icon: "activity" },
    { key: "associative", label: "Associative", icon: "graph" },
  ];
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
      <Card className="flex flex-col justify-center">
        <span className="text-3xl font-semibold text-soft-white">{stats.total}</span>
        <span className="mt-1 text-sm text-slate">Total memories</span>
      </Card>
      {types.map((t) => (
        <Card key={t.key} className="flex flex-col justify-center">
          <span className="flex items-center gap-2 text-sm text-slate">
            <Icon name={t.icon} size={16} className="text-violet" />
            {t.label}
          </span>
          <span className="mt-2 text-2xl font-semibold text-soft-white">{stats.byType[t.key]}</span>
        </Card>
      ))}
    </div>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
