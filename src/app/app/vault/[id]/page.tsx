import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentSession } from "@/server/auth/session";
import {
  getMemory,
  getMemoryEntities,
  getMemoryVersions,
} from "@/server/memory/storage";
import { listRelatedMemories } from "@/server/memory/relationships";
import { Badge } from "@/components/ui/badge";
import { DetailActions } from "@/components/app/memory/detail-actions";

function fmt(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default async function MemoryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getCurrentSession();
  if (!session) {
    return <p className="p-8 text-soft-white">You must be signed in.</p>;
  }
  const [memory, versions, related, entities] = await Promise.all([
    getMemory(session.id, id),
    getMemoryVersions(session.id, id),
    listRelatedMemories(session.id, id),
    getMemoryEntities(session.id, id),
  ]);
  if (!memory) notFound();

  return (
    <div className="mx-auto max-w-3xl p-6 lg:p-8">
      <Link href="/app/vault" className="text-sm text-slate hover:text-soft-white">← Back to Vault</Link>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold text-soft-white">Memory details</h1>
        <Badge>{memory.memoryType}</Badge>
        <Badge variant="subtle">{memory.state}</Badge>
        <span className="text-xs text-slate">version {memory.version}</span>
      </div>

      <DetailActions
        memoryId={memory.id}
        state={memory.state}
        initialContent={memory.content}
        initialSummary={memory.summary}
        initialType={memory.memoryType}
        initialConfidence={memory.confidence}
      />

      <section className="mt-6 rounded-2xl border border-soft-white/10 bg-midnight/30 p-5">
        <h2 className="text-sm font-medium uppercase tracking-wide text-slate">Summary</h2>
        <p className="mt-1 text-soft-white">{memory.summary ?? memory.content}</p>
      </section>

      <section className="mt-4 rounded-2xl border border-soft-white/10 bg-midnight/30 p-5">
        <h2 className="text-sm font-medium uppercase tracking-wide text-slate">Content</h2>
        <p className="mt-2 whitespace-pre-wrap text-soft-white">{memory.content}</p>
      </section>

      <section className="mt-4 grid gap-4 sm:grid-cols-2">
        <Meta label="Confidence" value={memory.confidence !== null ? memory.confidence.toFixed(2) : "n/a"} />
        <Meta label="Created" value={fmt(memory.createdAt)} />
        <Meta label="Updated" value={fmt(memory.updatedAt)} />
        <Meta label="Source" value={memory.sourceRef ?? "n/a"} />
        <Meta label="Valid from" value={fmt(memory.validFrom)} />
        <Meta label="Valid until" value={fmt(memory.validUntil)} />
      </section>

      {entities.length > 0 && (
        <section className="mt-4">
          <h2 className="text-sm font-medium uppercase tracking-wide text-slate">Entities</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {entities.map((e, i) => (
              <span key={i} className="rounded-full border border-soft-white/15 px-3 py-1 text-xs text-soft-white">
                {e.type}: {e.value}
              </span>
            ))}
          </div>
        </section>
      )}

      {related.length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-medium uppercase tracking-wide text-slate">Related memories</h2>
          <div className="mt-2 space-y-2">
            {related.map((r) => (
              <Link
                key={r.id}
                href={`/app/vault/${r.id}`}
                className="block rounded-xl border border-soft-white/10 px-4 py-2 text-sm text-soft-white hover:border-violet/50"
              >
                {r.relationshipType} → #{r.id.slice(0, 8)}
              </Link>
            ))}
          </div>
        </section>
      )}

      {versions.length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-medium uppercase tracking-wide text-slate">History</h2>
          <div className="mt-2 space-y-2">
            {versions.map((v) => (
              <details key={v.id} className="rounded-xl border border-soft-white/10 px-4 py-2">
                <summary className="cursor-pointer text-sm text-soft-white">
                  v{v.version} · {v.changeReason ?? "change"} · {fmt(v.createdAt)}
                </summary>
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate">{v.content}</p>
              </details>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-soft-white/10 bg-midnight/30 px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-slate">{label}</div>
      <div className="mt-1 text-sm text-soft-white">{value}</div>
    </div>
  );
}
