import { queryTenant } from "@/db/client";
import { userHasWorkspaceAccess } from "@/server/data/workspaces";
import { getJob, resetJobForRetry } from "@/server/memory/queue";
import {
  deleteMemoryHard,
  getMemory,
  setMemoryState,
} from "@/server/memory/storage";
import type { MemoryView } from "@/server/memory/types";

/**
 * Memory lifecycle operations. All transitions preserve history via
 * memory_versions (recorded in storage.setMemoryState) and are authorized
 * per user/workspace. No automatic deletion — every delete is explicit.
 */

export async function archiveMemory(userId: string, memoryId: string): Promise<MemoryView | null> {
  return setMemoryState(userId, memoryId, "archived", "archive");
}

export async function unarchiveMemory(userId: string, memoryId: string): Promise<MemoryView | null> {
  return setMemoryState(userId, memoryId, "active", "unarchive");
}

export async function requestReview(memoryId: string, userId: string): Promise<MemoryView | null> {
  return setMemoryState(userId, memoryId, "needs_review", "request_review");
}

export async function resolveReview(userId: string, memoryId: string, approve: boolean): Promise<MemoryView | null> {
  return setMemoryState(userId, memoryId, approve ? "active" : "archived", approve ? "review_approved" : "review_rejected");
}

export async function softDeleteMemory(userId: string, memoryId: string): Promise<MemoryView | null> {
  return setMemoryState(userId, memoryId, "deleted", "user_delete");
}

export async function purgeMemory(userId: string, memoryId: string): Promise<boolean> {
  const memory = await getMemory(userId, memoryId);
  if (!memory) return false;
  if (!(await userHasWorkspaceAccess(userId, memory.workspaceId))) {
    throw new Error("FORBIDDEN");
  }
  return deleteMemoryHard(userId, memoryId);
}

export async function retryProcessing(userId: string, jobId: string): Promise<boolean> {
  const job = await getJob(jobId);
  if (!job || job.ownerId !== userId) {
    throw new Error("FORBIDDEN");
  }
  if (job.state === "completed") return false;
  await resetJobForRetry(jobId);
  return true;
}

export interface ProcessingOverview {
  pendingJobs: number;
  runningJobs: number;
  failedJobs: number;
  retryableJobs: number;
  completedJobs: number;
  ingestionsByStatus: Record<string, number>;
}

export async function getProcessingOverview(userId: string): Promise<ProcessingOverview> {
  const jobRows = await queryTenant<{ state: string; count: string }>(
    userId,
    `SELECT state, count(*)::text AS count FROM processing_jobs
      WHERE owner_id = $1 GROUP BY state`,
    [userId],
  );
  const jobCounts: Record<string, number> = {};
  for (const r of jobRows) jobCounts[r.state] = Number(r.count);

  const ingRows = await queryTenant<{ status: string; count: string }>(
    userId,
    `SELECT status, count(*)::text AS count FROM ingestion_records
      WHERE owner_id = $1 GROUP BY status`,
    [userId],
  );
  const ingCounts: Record<string, number> = {};
  for (const r of ingRows) ingCounts[r.status] = Number(r.count);

  return {
    pendingJobs: jobCounts.pending ?? 0,
    runningJobs: jobCounts.running ?? 0,
    failedJobs: jobCounts.failed ?? 0,
    retryableJobs: jobCounts.retryable ?? 0,
    completedJobs: jobCounts.completed ?? 0,
    ingestionsByStatus: ingCounts,
  };
}
