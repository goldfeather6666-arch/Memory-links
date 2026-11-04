"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  retryJobAction,
  runProcessingNowAction,
} from "@/server/memory/actions";
import type { JobSummaryRow } from "@/server/memory/queue";
import type { IngestionSummary } from "@/server/memory/ingestion";
import type { ProcessingOverview } from "@/server/memory/lifecycle";

interface ProcessingPanelProps {
  overview: ProcessingOverview;
  jobs: JobSummaryRow[];
  ingestions: IngestionSummary[];
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function ProcessingPanel({ overview, jobs, ingestions }: ProcessingPanelProps) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function runAll() {
    setPending(true);
    setMessage(null);
    try {
      const out = await runProcessingNowAction();
      setMessage(out.ok ? { ok: true, text: `Processing pass completed (${out.id} jobs).` } : { ok: false, text: out.error ?? "Failed to run processing." });
    } finally {
      setPending(false);
    }
  }

  async function retry(jobId: string) {
    setPending(true);
    setMessage(null);
    try {
      const out = await retryJobAction(jobId);
      setMessage(out.ok ? { ok: true, text: "Job retried." } : { ok: false, text: out.error ?? "Retry failed." });
    } finally {
      setPending(false);
    }
  }

  const retryable = ["failed", "retryable", "pending", "running"];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-3">
          <Stat label="Pending" value={overview.pendingJobs} />
          <Stat label="Running" value={overview.runningJobs} />
          <Stat label="Retryable" value={overview.retryableJobs} />
          <Stat label="Failed" value={overview.failedJobs} />
          <Stat label="Completed" value={overview.completedJobs} />
        </div>
        <Button type="button" onClick={runAll} loading={pending}>
          Run processing now
        </Button>
      </div>

      {message && (
        <p role="status" className={`text-sm ${message.ok ? "text-emerald-300" : "text-red-300"}`}>
          {message.text}
        </p>
      )}

      <section>
        <h2 className="text-lg font-semibold text-soft-white">Processing jobs</h2>
        {jobs.length === 0 ? (
          <p className="mt-2 text-sm text-slate">No processing jobs yet.</p>
        ) : (
          <div className="mt-3 overflow-hidden rounded-2xl border border-soft-white/10">
            <div className="divide-y divide-soft-white/5">
              {jobs.map((job) => (
                <div key={job.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <Badge variant="secondary">{job.kind}</Badge>
                  <Badge>{job.state}</Badge>
                  <span className="text-sm text-soft-white">#{job.targetId.slice(0, 8)}</span>
                  <span className="text-xs text-slate">attempt {job.attempts}/{job.maxAttempts}</span>
                  {job.lastError && <span className="text-xs text-red-300">{job.lastError}</span>}
                  {retryable.includes(job.state) && (
                    <Button type="button" size="sm" variant="secondary" className="ml-auto" onClick={() => retry(job.id)} loading={pending}>
                      Retry
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold text-soft-white">Ingestions</h2>
        {ingestions.length === 0 ? (
          <p className="mt-2 text-sm text-slate">Nothing ingested yet.</p>
        ) : (
          <div className="mt-3 overflow-hidden rounded-2xl border border-soft-white/10">
            <div className="divide-y divide-soft-white/5">
              {ingestions.map((ing) => (
                <div key={ing.id} className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Badge>{ing.status}</Badge>
                    <span className="text-sm font-medium text-soft-white">{ing.title ?? ing.sourceType}</span>
                    <span className="text-xs text-slate">{fmtDate(ing.createdAt)}</span>
                  </div>
                  <p className="mt-1 text-sm text-slate line-clamp-1">{ing.contentPreview}</p>
                  {ing.error && <p className="mt-1 text-xs text-red-300">{ing.error}</p>}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-soft-white/10 bg-midnight/40 px-4 py-2">
      <div className="text-2xl font-semibold text-soft-white">{value}</div>
      <div className="text-xs uppercase tracking-wide text-slate">{label}</div>
    </div>
  );
}
