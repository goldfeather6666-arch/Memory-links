/**
 * MNEMOSYNE Part 4 — autonomous processing orchestrator.
 *
 * A durable, in-database job system for intelligence work. Jobs are enqueued
 * by user-authorized call sites and claimed/applied atomically. No in-memory
 * timers: scheduling is external (Vercel Cron on a protected route, or manual
 * / event-triggered runs). Retries use exponential backoff; jobs are
 * idempotent via engine-level dedupe + a per-kind idempotency key.
 *
 * All per-workspace data operations run under the job's owner via
 * queryTenant, so RLS still governs every data touch.
 */

import { queryRaw, queryTenant } from "@/db/client";
import { userHasWorkspaceAccess } from "@/server/data/workspaces";
import { getProcessingSettings } from "./settings";
import { canRunJob, recordUsage } from "./cost";
import { INTELLIGENCE_JOB_SELECT, mapIntelligenceJobRow } from "./helpers";
import { runEntityEnrichment, enrichRelationships } from "./entities";
import { runContradictionDetection } from "./contradictions";
import { runConsolidation } from "./consolidation";
import { runPatternDetection } from "./patterns";
import { computeAndStoreImportance } from "./importance";
import { generateSuggestions } from "./suggestions";
import type { IntelligenceJobRecord } from "./types";
import { INTELLIGENCE_JOB_KINDS } from "./types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const INTELLIGENCE_JOB_MAX_ATTEMPTS = 3;
export const INTELLIGENCE_JOB_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
export const INTELLIGENCE_JOB_BACKOFF_BASE_MS = 30_000;

const JOB_KIND_TO_ENGINE: Record<IntelligenceJobKind, string> = {
  entities: "entities",
  contradiction: "contradiction",
  consolidation: "consolidation",
  patterns: "patterns",
  importance: "importance",
  suggestions: "suggestions",
  full_analysis: "full_analysis",
};

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

async function assertAccess(userId: string, workspaceId: string): Promise<void> {
  if (!(await userHasWorkspaceAccess(userId, workspaceId))) {
    throw new Error("FORBIDDEN");
  }
}

// ---------------------------------------------------------------------------
// Enqueue
// ---------------------------------------------------------------------------

import type { IntelligenceJobKind } from "./types";

export async function enqueueIntelligenceJob(
  userId: string,
  workspaceId: string,
  opts: EnqueueIntelligenceOptions,
): Promise<IntelligenceJobRecord | null> {
  await assertAccess(userId, workspaceId);
  if (!INTELLIGENCE_JOB_KINDS.includes(opts.kind)) {
    throw new Error(`UNKNOWN_JOB_KIND: ${opts.kind}`);
  }

  // Idempotency: if an identical job already exists (same idempotency key)
  // in a non-terminal state, return it instead of double-enqueueing.
  if (opts.idempotencyKey) {
    const existing = await queryTenant<Record<string, unknown>>(
      userId,
      `SELECT ${INTELLIGENCE_JOB_SELECT} FROM intelligence_jobs
        WHERE workspace_id = $1 AND idempotency_key = $2
          AND state IN ('pending','running','retryable')
        ORDER BY created_at DESC LIMIT 1`,
      [workspaceId, opts.idempotencyKey],
    );
    if (existing[0]) return mapIntelligenceJobRow(existing[0]);
  }

  const runAfter = opts.runAfter ?? new Date();
  const rows = await queryTenant<Record<string, unknown>>(
    userId,
    `INSERT INTO intelligence_jobs (
        workspace_id, owner_id, kind, trigger_type, state, attempts, max_attempts,
        run_after, timeout_after, idempotency_key, settings
     ) VALUES ($1, $2, $3, $4, 'pending', 0, $5, $6, $7, $8, $9)
     RETURNING ${INTELLIGENCE_JOB_SELECT}`,
    [
      workspaceId,
      userId,
      opts.kind,
      opts.triggerType ?? "manual",
      INTELLIGENCE_JOB_MAX_ATTEMPTS,
      runAfter.toISOString(),
      new Date(Date.now() + INTELLIGENCE_JOB_TIMEOUT_MS).toISOString(),
      opts.idempotencyKey ?? null,
      opts.settings ?? {},
    ],
  );
  return mapIntelligenceJobRow(rows[0]);
}

// ---------------------------------------------------------------------------
// Claim / complete / fail (unscoped queue mechanics)
// ---------------------------------------------------------------------------

export async function claimReadyIntelligenceJobs(limit: number): Promise<IntelligenceJobRecord[]> {
  const rows = await queryRaw<Record<string, unknown>>(
    `UPDATE intelligence_jobs j SET
        state = 'running',
        locked_by = 'scheduler',
        locked_at = now(),
        updated_at = now()
     WHERE j.id IN (
       SELECT id FROM intelligence_jobs
       WHERE state IN ('pending','retryable') AND run_after <= now()
       ORDER BY created_at ASC
       LIMIT $1
     )
     RETURNING ${INTELLIGENCE_JOB_SELECT}`,
    [limit],
  );
  return rows.map(mapIntelligenceJobRow);
}

export async function completeIntelligenceJob(jobId: string): Promise<void> {
  await queryRaw(
    `UPDATE intelligence_jobs SET state = 'completed', locked_by = NULL, locked_at = NULL,
            last_error = NULL, updated_at = now() WHERE id = $1`,
    [jobId],
  );
}

export async function failIntelligenceJob(
  jobId: string,
  error: string,
  retryable: boolean,
): Promise<"retryable" | "failed"> {
  const job = await queryRaw<{ attempts: number; maxAttempts: number }>(
    `SELECT attempts, max_attempts AS "maxAttempts" FROM intelligence_jobs WHERE id = $1`,
    [jobId],
  );
  const attempts = (job[0]?.attempts ?? 0) + 1;
  const maxAttempts = job[0]?.maxAttempts ?? INTELLIGENCE_JOB_MAX_ATTEMPTS;

  if (retryable && attempts < maxAttempts) {
    const backoffMs = INTELLIGENCE_JOB_BACKOFF_BASE_MS * Math.pow(2, attempts - 1);
    await queryRaw(
      `UPDATE intelligence_jobs SET state = 'retryable', attempts = $2,
              locked_by = NULL, locked_at = NULL, last_error = $3,
              run_after = now() + make_interval(secs => $4), updated_at = now()
       WHERE id = $1`,
      [jobId, attempts, error, backoffMs / 1000],
    );
    return "retryable";
  }

  await queryRaw(
    `UPDATE intelligence_jobs SET state = 'failed', attempts = $2,
            locked_by = NULL, locked_at = NULL, last_error = $3, updated_at = now()
     WHERE id = $1`,
    [jobId, attempts, error],
  );
  return "failed";
}

// ---------------------------------------------------------------------------
// Job execution (per kind)
// ---------------------------------------------------------------------------

export interface ExecuteJobResult {
  ok: boolean;
  retryable: boolean;
  summary: Record<string, unknown>;
  error?: string;
}

async function executeEngineJob(
  job: IntelligenceJobRecord,
): Promise<ExecuteJobResult> {
  const ownerId = job.ownerId;
  const workspaceId = job.workspaceId;
  const limit = job.settings?.limit ? Number(job.settings.limit) : undefined;

  switch (job.kind) {
    case "entities": {
      const a = await runEntityEnrichment(ownerId, workspaceId, { limit });
      const b = await enrichRelationships(ownerId, workspaceId, { limit });
      return { ok: true, retryable: false, summary: { ...a, relationships: b } };
    }
    case "contradiction": {
      const r = await runContradictionDetection(ownerId, workspaceId, { limit });
      return { ok: true, retryable: false, summary: r };
    }
    case "consolidation": {
      const r = await runConsolidation(ownerId, workspaceId, { limit });
      return { ok: true, retryable: false, summary: r };
    }
    case "patterns": {
      const r = await runPatternDetection(ownerId, workspaceId, { limit });
      return { ok: true, retryable: false, summary: r };
    }
    case "importance": {
      const r = await computeAndStoreImportance(ownerId, workspaceId, { limit });
      return { ok: true, retryable: false, summary: { ...r } };
    }
    case "suggestions": {
      const r = await generateSuggestions(ownerId, workspaceId, { limit });
      return { ok: true, retryable: false, summary: { ...r } };
    }
    case "full_analysis": {
      const entities = await runEntityEnrichment(ownerId, workspaceId, { limit });
      await enrichRelationships(ownerId, workspaceId, { limit });
      const contradiction = await runContradictionDetection(ownerId, workspaceId, { limit });
      const consolidation = await runConsolidation(ownerId, workspaceId, { limit });
      const patterns = await runPatternDetection(ownerId, workspaceId, { limit });
      const importance = await computeAndStoreImportance(ownerId, workspaceId, { limit });
      const suggestions = await generateSuggestions(ownerId, workspaceId, { limit });
      return {
        ok: true,
        retryable: false,
        summary: { entities, contradiction, consolidation, patterns, importance, suggestions },
      };
    }
    default:
      return { ok: false, retryable: false, summary: {}, error: `UNKNOWN_KIND: ${job.kind}` };
  }
}

/** Run one claimed job to completion with retry/failure handling + usage stamp. */
export async function runIntelligenceJob(job: IntelligenceJobRecord): Promise<ExecuteJobResult> {
  try {
    const result = await executeEngineJob(job);
    await completeIntelligenceJob(job.id);
    await recordUsage({
      workspaceId: job.workspaceId,
      ownerId: job.ownerId,
      jobKind: job.kind,
      // Deterministic paths don't consume model tokens; recorded as 0.
      inputTokens: 0,
      outputTokens: 0,
      cached: true,
      costEstimate: 0,
    });
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const retryable = isRetryableError(err);
    const finalState = await failIntelligenceJob(job.id, message, retryable);
    return {
      ok: false,
      retryable: finalState === "retryable",
      summary: {},
      error: message,
    };
  }
}

function isRetryableError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  // Network / provider unavailability / lock contention are retryable;
  // validation & permission errors are not.
  return /ECONNREFUSED|ETIMEDOUT|ECONNRESET|provider|unavailable|timeout|lock/i.test(msg);
}

// ---------------------------------------------------------------------------
// Pause / resume
// ---------------------------------------------------------------------------

export async function pauseAutomaticProcessing(userId: string, workspaceId: string): Promise<void> {
  await assertAccess(userId, workspaceId);
  const settings = await getProcessingSettings(userId, workspaceId);
  await import("./settings").then((m) =>
    m.saveProcessingSettings(userId, workspaceId, {
      automaticConsolidation: false,
      enabledKinds: settings.enabledKinds,
    }),
  );
}

export async function resumeAutomaticProcessing(userId: string, workspaceId: string): Promise<void> {
  await assertAccess(userId, workspaceId);
  const settings = await getProcessingSettings(userId, workspaceId);
  await import("./settings").then((m) =>
    m.saveProcessingSettings(userId, workspaceId, {
      automaticConsolidation: true,
      enabledKinds: settings.enabledKinds,
    }),
  );
}

// ---------------------------------------------------------------------------
// Orchestrated runs
// ---------------------------------------------------------------------------

export interface ManualAnalysisResult {
  jobId: string;
  ok: boolean;
  summary: Record<string, unknown>;
  error?: string;
}

/** Run a full analysis synchronously and enqueue a matching record for history. */
export async function runManualAnalysis(
  userId: string,
  workspaceId: string,
): Promise<ManualAnalysisResult> {
  await assertAccess(userId, workspaceId);
  const settings = await getProcessingSettings(userId, workspaceId);

  const job = await enqueueIntelligenceJob(userId, workspaceId, {
    kind: "full_analysis",
    triggerType: "manual",
    idempotencyKey: `manual-${workspaceId}-${Date.now()}`,
    settings: { limit: 250 },
  });
  if (!job) return { jobId: "", ok: false, summary: {}, error: "Enqueue failed" };

  const result = await executeEngineJob(job);
  if (result.ok) {
    await completeIntelligenceJob(job.id);
  } else {
    await failIntelligenceJob(job.id, result.error ?? "failed", result.retryable);
  }

  // Respect pause: if disabled and this was a manual run, it still ran (manual
  // overrides pause). The setting governs scheduled/event runs.
  void settings;
  return { jobId: job.id, ok: result.ok, summary: result.summary, error: result.error };
}

/** Enqueue scheduled/incremental jobs respecting settings + budget. */
export async function enqueueScheduledAnalysis(
  userId: string,
  workspaceId: string,
): Promise<{ enqueued: number }> {
  await assertAccess(userId, workspaceId);
  const settings = await getProcessingSettings(userId, workspaceId);
  if (!settings.automaticConsolidation) {
    return { enqueued: 0 }; // opt-in off = no scheduled work
  }

  const { allowed } = await canRunJob(userId, workspaceId, 10_000);
  if (!allowed) return { enqueued: 0 };

  let enqueued = 0;
  for (const kind of settings.enabledKinds) {
    if (!INTELLIGENCE_JOB_KINDS.includes(kind)) continue;
    const job = await enqueueIntelligenceJob(userId, workspaceId, {
      kind,
      triggerType: "scheduled",
      idempotencyKey: `sched-${workspaceId}-${kind}-${new Date().toISOString().slice(0, 13)}`,
      settings: { limit: 250 },
    });
    if (job) enqueued += 1;
  }
  return { enqueued };
}

export { JOB_KIND_TO_ENGINE };
