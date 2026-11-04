import Link from "next/link";
import { getCurrentSession } from "@/server/auth/session";
import { listWorkspacesForUser } from "@/server/data/workspaces";
import { recallMemories } from "@/server/memory/retrieval";
import { listMemories } from "@/server/memory/storage";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/app/icons";
import type { MemoryView } from "@/server/memory/types";

const TYPES = ["episodic", "semantic", "procedural", "associative"] as const;

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
}

async function loadData(sessionId: string, workspaceId: string, q: string, type: string | null) {
  const memoryTypes = type && (TYPES as readonly string[]).includes(type) ? [type] : undefined;
  if (q) {
    const r = await recallMemories(sessionId, {
      workspaceId,
      query: q,
      memoryTypes: memoryTypes as never[] | undefined,
      limit: 30,
    });
    return { items: r.items, total: r.total, method: r.method };
  }
  const r = await listMemories(sessionId, workspaceId, {
    memoryTypes: memoryTypes as never[] | undefined,
    limit: 30,
  });
  return { items: r.items, total: r.total, method: null };
}

export default async function VaultPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; workspace?: string }>;
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
        <h1 className="text-2xl font-semibold text-soft-white">Memory Vault</h1>
        <p className="mt-2 text-slate">Create a workspace to start storing memories.</p>
      </div>
    );
  }
  const active = workspaces.find((w) => w.workspace.id === sp.workspace)?.workspace ?? workspaces[0].workspace;
  const q = sp.q?.trim() ?? "";
  const type = sp.type ?? null;

  const { items, method } = await loadData(session.id, active.id, q, type);

  return (
    <div className="p-6 lg:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-soft-white">Memory Vault</h1>
          <p className="text-sm text-slate">Search and manage your extracted memories · {active.name}</p>
        </div>
        <Link
          href={`/app/vault/new?workspace=${active.id}`}
          className="inline-flex items-center gap-2 rounded-xl bg-violet px-4 py-2 text-sm font-medium text-white hover:bg-violet/90"
        >
          <Icon name="plus" size={16} /> Add memory
        </Link>
      </div>

      <form method="get" action="/app/vault" className="mt-6 flex flex-col gap-3 sm:flex-row">
        <input type="hidden" name="workspace" value={active.id} />
        <div className="relative flex-1">
          <Icon name="search" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate" />
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search memories…"
            className="h-11 w-full rounded-xl border border-soft-white/15 bg-midnight/60 pl-10 pr-4 text-sm text-soft-white placeholder:text-slate focus:border-violet focus:outline-none"
          />
        </div>
        <button
          type="submit"
          className="h-11 rounded-xl border border-soft-white/15 bg-midnight/60 px-4 text-sm text-soft-white hover:border-violet"
        >
          Search
        </button>
      </form>

      <div className="mt-4 flex flex-wrap gap-2">
        <TypeLink workspace={active.id} label="All" active={!type} />
        {TYPES.map((t) => (
          <TypeLink key={t} workspace={active.id} type={t} label={t} active={type === t} />
        ))}
      </div>

      <div className="mt-6 space-y-3">
        {items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-soft-white/15 p-10 text-center">
            <p className="text-soft-white">No memories here yet.</p>
            <p className="mt-1 text-sm text-slate">
              {q ? "Try a different search." : "Add content and let extraction find the memories worth keeping."}
            </p>
            <Link
              href={`/app/vault/new?workspace=${active.id}`}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-violet px-4 py-2 text-sm font-medium text-white hover:bg-violet/90"
            >
              <Icon name="plus" size={16} /> Add your first memory
            </Link>
          </div>
        ) : (
          <>
            {method && <p className="text-xs text-slate">Search method: {method}</p>}
            {items.map((m) => (
              <MemoryCard key={m.id} memory={m} workspaceId={active.id} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function TypeLink({
  workspace,
  type,
  label,
  active,
}: {
  workspace: string;
  type?: string;
  label: string;
  active: boolean;
}) {
  const href = type ? `/app/vault?workspace=${workspace}&type=${type}` : `/app/vault?workspace=${workspace}`;
  return (
    <Link
      href={href}
      className={`rounded-full border px-3 py-1 text-xs ${
        active ? "border-violet bg-violet/15 text-soft-white" : "border-soft-white/15 text-slate hover:border-violet/50"
      }`}
    >
      {label}
    </Link>
  );
}

function MemoryCard({ memory, workspaceId }: { memory: MemoryView; workspaceId: string }) {
  return (
    <Link
      href={`/app/vault/${memory.id}?workspace=${workspaceId}`}
      className="block rounded-2xl border border-soft-white/10 bg-midnight/40 p-4 transition hover:border-violet/50"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge>{memory.memoryType}</Badge>
        {memory.state !== "active" && <Badge variant="subtle">{memory.state}</Badge>}
        <span className="text-xs text-slate">conf {memory.confidence !== null ? memory.confidence.toFixed(2) : "n/a"}</span>
        <span className="text-xs text-slate">v{memory.version}</span>
        <span className="ml-auto text-xs text-slate">{fmtDate(memory.createdAt)}</span>
      </div>
      <p className="mt-2 text-sm font-medium text-soft-white line-clamp-1">{memory.summary ?? memory.content}</p>
      <p className="mt-1 text-sm text-slate line-clamp-2">{memory.content}</p>
    </Link>
  );
}
