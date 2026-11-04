import { claimReadyJobs, completeJob, failJob, type JobRecord } from "@/server/memory/queue";
import { runExtractionJob } from "@/server/memory/extraction";
import { embedMemory } from "@/server/memory/embeddings";
import { isRetryableError } from "@/server/memory/errors";
import { createIngestion, requireValidIngestionInput } from "@/server/memory/ingestion";
import { JOB_CONCURRENCY } from "@/server/memory/constants";
import type { IngestionInput, IngestionRecord } from "@/server/memory/types";

/**
 * High-level orchestrator for the memory engine. Combines ingestion + the
 * background job loop, and runs extraction/embedding jobs with bounded
 * concurrency. The engine stays fully functional when providers are down:
 * jobs are parked in a retryable state instead of dropping content.
 */

async function processJob(job: JobRecord): Promise<void> {
  if (job.kind === "extraction") {
    await runExtractionJob(job.ownerId, job.targetId);
  } else if (job.kind === "embedding") {
    await embedMemory(job.ownerId, job.targetId);
  } else {
    throw new Error(`Unknown job kind: ${String(job.kind)}`);
  }
}

export async function runProcessingPass(limit: number = JOB_CONCURRENCY): Promise<number> {
  const jobs = await claimReadyJobs(limit);
  let processed = 0;
  for (const job of jobs) {
    try {
      await processJob(job);
      await completeJob(job.id);
      processed++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await failJob(job.id, message, isRetryableError(err));
    }
  }
  return processed;
}

export async function ingestText(userId: string, input: IngestionInput): Promise<IngestionRecord> {
  requireValidIngestionInput(input);
  const record = await createIngestion(userId, input);
  // Best-effort immediate processing pass; failures are preserved on the job
  // and retryable via the Processing Center.
  try {
    await runProcessingPass(JOB_CONCURRENCY);
  } catch {
    // ignored — the job queue retains any failure state
  }
  return record;
}
