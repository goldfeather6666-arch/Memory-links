import { redirect } from "next/navigation";
import { getCurrentSession } from "@/server/auth/session";
import { listWorkspacesForUser } from "@/server/data/workspaces";
import { queryTenant } from "@/db/client";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/app/icons";
import { DemoBadge } from "@/components/app/demo-badge";

interface IngestionRow {
  id: string;
  title: string | null;
  contentPreview: string;
  content: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/signin");

  let workspaces: Awaited<ReturnType<typeof listWorkspacesForUser>>;
  try {
    workspaces = await listWorkspacesForUser(session.id);
  } catch {
    return <DataUnavailable />;
  }

  if (workspaces.length === 0) {
    return (
      <div className="space-y-6">
        <Header />
        <EmptyState
          icon={<Icon name="documents" size={28} />}
          title="No documents yet"
          description="Create a workspace to start importing source material."
        />
      </div>
    );
  }

  const workspaceId = workspaces[0].workspace.id;

  let docs: IngestionRow[] = [];
  let loadFailed = false;
  try {
    docs = await queryTenant<IngestionRow>(
      session.id,
      `SELECT id, title, content_preview AS "contentPreview", content, metadata,
              created_at AS "createdAt"
         FROM ingestion_records
        WHERE workspace_id = $1
        ORDER BY created_at DESC`,
      [workspaceId],
    );
  } catch {
    loadFailed = true;
  }

  return (
    <div className="space-y-6">
      <Header />
      {loadFailed ? (
        <Card>
          <CardHeader>
            <CardTitle>Documents could not be loaded</CardTitle>
            <CardDescription>
              Your imported source material could not be reached right now. Please try again in a moment.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : docs.length === 0 ? (
        <EmptyState
          icon={<Icon name="documents" size={28} />}
          title="No documents yet"
          description="Imported source material will appear here and feed your memory engine."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {docs.map((d) => (
            <DocumentCard key={d.id} doc={d} />
          ))}
        </div>
      )}
    </div>
  );
}

function Header() {
  return (
    <header>
      <h1 className="text-2xl font-semibold text-soft-white">Documents</h1>
      <p className="mt-1 text-sm text-slate">Import and manage source material.</p>
    </header>
  );
}

function DataUnavailable() {
  return (
    <div className="space-y-6">
      <Header />
      <Card>
        <CardHeader>
          <CardTitle>Documents data is unavailable right now</CardTitle>
          <CardDescription>
            You are signed in, but your workspace data could not be reached. Try again soon.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}

function DocumentCard({ doc }: { doc: IngestionRow }) {
  const meta = doc.metadata ?? {};
  const kind =
    typeof meta.demo_category === "string"
      ? meta.demo_category
      : typeof meta.kind === "string"
        ? meta.kind
        : null;
  const isDemo = meta.is_demo === true;
  const preview = doc.contentPreview || doc.content;

  return (
    <div className="flex flex-col rounded-xl border border-soft-white/10 bg-midnight/40 p-4">
      <div className="flex flex-wrap items-center gap-2">
        {kind && <Badge variant="subtle">{kind}</Badge>}
        {isDemo && <DemoBadge />}
        <span className="ml-auto text-xs text-slate">{formatDate(doc.createdAt)}</span>
      </div>
      <h3 className="mt-2 text-sm font-medium text-soft-white line-clamp-1">
        {doc.title || "Untitled document"}
      </h3>
      <p className="mt-1 text-sm text-slate line-clamp-2">{preview}</p>
    </div>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
