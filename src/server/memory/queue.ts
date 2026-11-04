import { queryRaw, queryTenant } from "@/db/client";
import { userHasWorkspaceAccess } from "@/server/data/workspaces";
import {
  JOB_BACKOFF_BASE_MS,
  JOB_MAX_ATTEMPTS,
  JOB_TIMEOUT_MS,
} from "@/server/memory/constants";
import type { JobKind, JobRecord, JobState } from "@/server/memory/types";

/**
 * In-database job queue. The queue is a trusted internal mechanism: enqueue
 * is authorized per-user at the call site, while claim/complete/fail are
 * performed unscoped (queryRaw) because they run on behalf of the scheduler
 * across many users. All per-user work then runs under the job's owner via
 * queryTenant, so RLS still applies to the actual data operations.
 */

export async function enqueueJob(
  ownerId: string,
  workspaceId: string,
  kind: JobKind,
  targetId: string,
): Promise<JobRecord> {
  if (!(await userHasWorkspaceAccess(ownerId, workspaceId))) {
    throw new Error("FORBIDDEN");
  }
  const rows = await queryTenant<JobRecord>(
    ownerId,
    `INSERT INTO processing_jobs (workspace_id, owner_id, kind, target_id, max_attempts, timeout_after)
     VALUES ($1, $2, $3, $4, $5, now() + make_interval(secs => $6))
     RETURNING id, workspace_id AS "workspaceId", owner_id AS "ownerId", kind,
               target_id AS "targetId", state, attempts,
               max_attempts AS "maxAttempts", run_after AS "runAfter",
               locked_by AS "lockedBy", locked_at AS "lockedAt",
               last_error AS "lastError", timeout_after AS "timeoutAfter",
               created_at AS "createdAt", updated_at AS "updatedAt"`,
    [workspaceId, ownerId, kind, targetId, JOB_MAX_ATTEMPTS, JOB_TIMEOUT_MS / 1000],
  );
  return rows[0];
}

/**
 * Atomically claim up to `limit` ready jobs (state pending/retryable and
 * run_after due). Returns the claimed rows whose state is now 'running'.
 */
export async function claimReadyJobs(limit: number): Promise<JobRecord[]> {
  const rows = await queryRaw<JobRecord>(
    `UPDATE processing_jobs j SET
        state = 'running',
        locked_by = 'scheduler',
        locked_at = now(),
        updated_at = now()
     WHERE j.id IN (
       SELECT id FROM processing_jobs
       WHERE state IN ('pending','retryable') AND run_after <= now()
       ORDER BY created_at ASC
       LIMIT $1
     )
     RETURNING id, workspace_id AS "workspaceId", owner_id AS "ownerId", kind,
               target_id AS "targetId", state, attempts,
               max_attempts AS "maxAttempts", run_after AS "runAfter",
               locked_by AS "lockedBy", locked_at AS "lockedAt",
               last_error AS "lastError", timeout_after AS "timeoutAfter",
               created_at AS "createdAt", updated_at AS "updatedAt"`,
    [limit],
  );
  return rows;
}

export async function completeJob(jobId: string): Promise<void> {
  await queryRaw(
    `UPDATE processing_jobs SET state = 'completed', locked_by = NULL, locked_at = NULL,
            last_error = NULL, updated_at = now() WHERE id = $1`,
    [jobId],
  );
}

export async function failJob(
  jobId: string,
  error: string,
  retryable: boolean,
): Promise<"retryable" | "failed"> {
  const job = await queryRaw<{ attempts: number; maxAttempts: number }>(
    `SELECT attempts, max_attempts AS "maxAttempts" FROM processing_jobs WHERE id = $1`,
    [jobId],
  );
  const attempts = (job[0]?.attempts ?? 0) + 1;
  const maxAttempts = job[0]?.maxAttempts ?? JOB_MAX_ATTEMPTS;

  if (retryable && attempts < maxAttempts) {
    const backoffMs = JOB_BACKOFF_BASE_MS * Math.pow(2, attempts - 1);
    await queryRaw(
      `UPDATE processing_jobs SET state = 'retryable', attempts = $2,
              locked_by = NULL, locked_at = NULL, last_error = $3,
              run_after = now() + make_interval(secs => $4), updated_at = now()
       WHERE id = $1`,
      [jobId, attempts, error, backoffMs / 1000],
    );
    return "retryable";
  }

  await queryRaw(
    `UPDATE processing_jobs SET state = 'failed', attempts = $2,
            locked_by = NULL, locked_at = NULL, last_error = $3, updated_at = now()
     WHERE id = $1`,
    [jobId, attempts, error],
  );
  return "failed";
}

export async function getJob(jobId: string): Promise<JobRecord | null> {
  const rows = await queryRaw<JobRecord>(
    `SELECT id, workspace_id AS "workspaceId", owner_id AS "ownerId", kind,
            target_id AS "targetId", state, attempts,
            max_attempts AS "maxAttempts", run_after AS "runAfter",
            locked_by AS "lockedBy", locked_at AS "lockedAt",
            last_error AS "lastError", timeout_after AS "timeoutAfter",
            created_at AS "createdAt", updated_at AS "updatedAt"
       FROM processing_jobs WHERE id = $1`,
    [jobId],
  );
  return rows[0] ?? null;
}

export interface JobSummaryRow {
  id: string;
  workspaceId: string;
  ownerId: string;
  kind: JobKind;
  targetId: string;
  state: JobState;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function listJobsForUser(
  userId: string,
  opts: { state?: JobState; limit?: number; offset?: number } = {},
): Promise<JobSummaryRow[]> {
  const limit = Math.min(opts.limit ?? 50, 200);
  const offset = opts.offset ?? 0;
  const rows = await queryTenant<JobSummaryRow>(
    userId,
    `SELECT id, workspace_id AS "workspaceId", owner_id AS "ownerId", kind,
            target_id AS "targetId", state, attempts,
            max_attempts AS "maxAttempts", last_error AS "lastError",
            created_at AS "createdAt", updated_at AS "updatedAt"
       FROM processing_jobs j
       WHERE j.owner_id = $1 AND ($2::text IS NULL OR j.state = $2)
       ORDER BY j.updated_at DESC
       LIMIT $3 OFFSET $4`,
    [userId, opts.state ?? null, limit, offset],
  );
  return rows.map((r) => ({
    ...r,
    state: r.state as JobState,
  }));
}

export async function resetJobForRetry(jobId: string): Promise<void> {
  await queryRaw(
    `UPDATE processing_jobs SET state = 'pending', run_after = now(),
            locked_by = NULL, locked_at = NULL, last_error = NULL, updated_at = now()
     WHERE id = $1`,
    [jobId],
  );
}
