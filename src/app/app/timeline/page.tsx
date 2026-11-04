import { redirect } from "next/navigation";
import { getCurrentSession } from "@/server/auth/session";
import { listWorkspacesForUser } from "@/server/data/workspaces";
import { listMemoryRecordsInWorkspace } from "@/server/data/memory";
import type { MemoryRecord } from "@/db/schema";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/app/icons";
import { DemoBadge } from "@/components/app/demo-badge";

export const dynamic = "force-dynamic";

export default async function TimelinePage() {
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
          icon={<Icon name="timeline" size={28} />}
          title="No timeline yet"
          description="Create a workspace to start replaying events over time."
        />
      </div>
    );
  }

  const workspaceId = workspaces[0].workspace.id;

  let records: MemoryRecord[] = [];
  let loadFailed = false;
  try {
    records = await listMemoryRecordsInWorkspace(session.id, workspaceId);
  } catch {
    loadFailed = true;
  }

  return (
    <div className="space-y-6">
      <Header />
      {loadFailed ? (
        <Card>
          <CardHeader>
            <CardTitle>The timeline could not be loaded</CardTitle>
            <CardDescription>
              Your memory records could not be reached right now. Please try again in a moment.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : records.length === 0 ? (
        <EmptyState
          icon={<Icon name="timeline" size={28} />}
          title="No timeline yet"
          description="Events and memory records will form a timeline here."
        />
      ) : (
        <Timeline records={records} />
      )}
    </div>
  );
}

function Header() {
  return (
    <header>
      <h1 className="text-2xl font-semibold text-soft-white">Timeline</h1>
      <p className="mt-1 text-sm text-slate">Replay events over time.</p>
    </header>
  );
}

function DataUnavailable() {
  return (
    <div className="space-y-6">
      <Header />
      <Card>
        <CardHeader>
          <CardTitle>Timeline data is unavailable right now</CardTitle>
          <CardDescription>
            You are signed in, but your workspace data could not be reached. Try again soon.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}

function Timeline({ records }: { records: MemoryRecord[] }) {
  const sorted = [...records].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  const groups = new Map<string, MemoryRecord[]>();
  for (const r of sorted) {
    const d = new Date(r.createdAt);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const list = groups.get(key) ?? [];
    list.push(r);
    groups.set(key, list);
  }
  return (
    <div className="space-y-8">
      {[...groups.entries()].map(([key, monthRecords]) => {
        const [year, month] = key.split("-").map(Number);
        const label = new Date(year, month).toLocaleDateString(undefined, {
          month: "long",
          year: "numeric",
        });
        return (
          <section key={key}>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate">
              {label}
            </h2>
            <ol className="space-y-3">
              {monthRecords.map((r) => (
                <MemoryRow key={r.id} record={r} />
              ))}
            </ol>
          </section>
        );
      })}
    </div>
  );
}

function MemoryRow({ record }: { record: MemoryRecord }) {
  const meta = record.metadata ?? {};
  const category = typeof meta.category === "string" ? meta.category : null;
  const isDemo = meta.is_demo === true;
  return (
    <li className="rounded-xl border border-soft-white/10 bg-midnight/40 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="violet">{record.memoryType}</Badge>
        {category && <Badge variant="subtle">{category}</Badge>}
        {isDemo && <DemoBadge />}
        <span className="ml-auto text-xs text-slate">{formatDate(record.createdAt)}</span>
      </div>
      <p className="mt-2 text-sm font-medium text-soft-white">{firstSentence(record.content)}</p>
    </li>
  );
}

function firstSentence(content: string): string {
  const trimmed = content.trim();
  const match = trimmed.match(/^.*?[.!?](?=\s|$)/);
  if (match) return match[0].trim();
  return trimmed.length > 140 ? `${trimmed.slice(0, 140)}…` : trimmed;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
