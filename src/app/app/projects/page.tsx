import { redirect } from "next/navigation";
import { getCurrentSession } from "@/server/auth/session";
import { listWorkspacesForUser } from "@/server/data/workspaces";
import { listProjectsInWorkspace } from "@/server/data/projects";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/app/icons";
import { NewProjectForm } from "@/components/app/new-project-form";
import { WorkspaceSwitcher } from "@/components/app/workspace-switcher";

export const dynamic = "force-dynamic";

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ ws?: string }>;
}) {
  const session = await getCurrentSession();
  if (!session) redirect("/signin");

  const params = await searchParams;
  const workspaces = await listWorkspacesForUser(session.id);
  if (workspaces.length === 0) {
    return (
      <EmptyState
        icon={<Icon name="projects" size={28} />}
        title="Create a workspace first"
        description="Projects belong to a workspace."
        action={
          <a href="/app" className="inline-flex h-9 items-center justify-center rounded-xl bg-violet px-3 text-sm font-medium text-soft-white hover:bg-violet/85">
            Go to Command Center
          </a>
        }
      />
    );
  }

  const requested = params.ws;
  const selected = requested
    ? workspaces.find((w) => w.workspace.id === requested) ?? workspaces[0]
    : workspaces[0];
  const workspaceId = selected.workspace.id;

  const projects = await listProjectsInWorkspace(session.id, workspaceId);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-soft-white">Projects</h1>
          <p className="mt-1 text-sm text-slate">Organize your work into projects.</p>
        </div>
        <WorkspaceSwitcher
          workspaces={workspaces.map((w) => ({ id: w.workspace.id, name: w.workspace.name }))}
          current={workspaceId}
        />
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {projects.length === 0 ? (
            <EmptyState
              icon={<Icon name="projects" size={28} />}
              title="No projects yet"
              description="Create your first project to start organizing."
            />
          ) : (
            <div className="space-y-3">
              {projects.map((p) => (
                <Card key={p.id}>
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <span className="font-medium text-soft-white">{p.name}</span>
                      {p.description && <p className="mt-1 truncate text-sm text-slate">{p.description}</p>}
                    </div>
                    <Badge variant={p.status === "archived" ? "danger" : "violet"}>{p.status}</Badge>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
        <Card>
          <CardHeader>
            <CardTitle>New project</CardTitle>
            <CardDescription>Create a project in this workspace.</CardDescription>
          </CardHeader>
          <NewProjectForm workspaceId={workspaceId} />
        </Card>
      </div>
    </div>
  );
}
