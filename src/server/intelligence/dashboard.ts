/**
 * MNEMOSYNE Part 4 — Intelligence Dashboard data. Every metric derives from
 * real records; nothing is invented. Includes memory health, recent
 * intelligence activity, and a job-processing summary.
 */

import { queryTenant } from "@/db/client";
import { userHasWorkspaceAccess } from "@/server/data/workspaces";
import type { IntelligenceDashboardData } from "./types";

async function assertAccess(userId: string, workspaceId: string): Promise<void> {
  if (!(await userHasWorkspaceAccess(userId, workspaceId))) {
    throw new Error("FORBIDDEN");
  }
}

export async function getIntelligenceDashboard(
  userId: string,
  workspaceId: string,
): Promise<IntelligenceDashboardData> {
  await assertAccess(userId, workspaceId);

  const [health, jobs, recentPatterns, recentConsolidations, recentSuggestions, recentConflicts] =
    await Promise.all([
      queryTenant<Record<string, unknown>>(
        userId,
        `SELECT
           (SELECT COUNT(*) FROM memory_records WHERE workspace_id = $1 AND state = 'active')::int AS "activeMemories",
           (SELECT COUNT(*) FROM memory_records WHERE workspace_id = $1)::int AS "totalMemories",
           (SELECT COUNT(*) FROM consolidations WHERE workspace_id = $1 AND status = 'active')::int AS "consolidatedMemories",
           (SELECT COUNT(*) FROM intelligence_jobs WHERE workspace_id = $1 AND state = 'pending')::int AS "pendingAnalysis",
           (SELECT COUNT(*) FROM contradictions WHERE workspace_id = $1 AND status = 'unresolved')::int AS "unresolvedConflicts",
           (SELECT COUNT(*) FROM intelligence_jobs WHERE workspace_id = $1 AND state = 'failed')::int AS "failedProcessingJobs"`,
        [workspaceId],
      ),
      queryTenant<Record<string, unknown>>(
        userId,
        `SELECT
           (SELECT COUNT(*) FROM intelligence_jobs WHERE workspace_id = $1)::int AS "totalJobs",
           (SELECT COUNT(*) FROM intelligence_jobs WHERE workspace_id = $1 AND state = 'completed')::int AS "completedJobs",
           (SELECT COUNT(*) FROM intelligence_jobs WHERE workspace_id = $1 AND state = 'failed')::int AS "failedJobs",
           (SELECT COUNT(*) FROM intelligence_jobs WHERE workspace_id = $1 AND state = 'retryable')::int AS "retryableJobs",
           (SELECT MAX(created_at) FROM intelligence_jobs WHERE workspace_id = $1 AND state = 'completed') AS "lastSuccessfulRun",
           (SELECT MAX(created_at) FROM intelligence_jobs WHERE workspace_id = $1) AS "lastRunAt",
           (SELECT last_error FROM intelligence_jobs WHERE workspace_id = $1 AND state = 'failed' ORDER BY updated_at DESC LIMIT 1) AS "lastRunError"`,
        [workspaceId],
      ),
      queryTenant<Record<string, unknown>>(
        userId,
        `SELECT id, pattern_type AS "patternType", description, created_at AS "createdAt"
           FROM patterns WHERE workspace_id = $1 AND status = 'active'
           ORDER BY created_at DESC LIMIT 5`,
        [workspaceId],
      ),
      queryTenant<Record<string, unknown>>(
        userId,
        `SELECT id, kind, title, created_at AS "createdAt"
           FROM consolidations WHERE workspace_id = $1 AND status = 'active'
           ORDER BY created_at DESC LIMIT 5`,
        [workspaceId],
      ),
      queryTenant<Record<string, unknown>>(
        userId,
        `SELECT id, suggestion_type AS "suggestionType", title, status, created_at AS "createdAt"
           FROM suggestions WHERE workspace_id = $1
           ORDER BY created_at DESC LIMIT 5`,
        [workspaceId],
      ),
      queryTenant<Record<string, unknown>>(
        userId,
        `SELECT id, category, created_at AS "createdAt"
           FROM contradictions WHERE workspace_id = $1 AND status = 'unresolved'
           ORDER BY created_at DESC LIMIT 5`,
        [workspaceId],
      ),
    ]);

  const h = health[0] ?? {};
  const j = jobs[0] ?? {};

  const recent: IntelligenceDashboardData["recent"] = [];
  const push = (
    id: string,
    kind: IntelligenceDashboardData["recent"][number]["kind"],
    title: string,
    subtitle: string,
    createdAt: unknown,
    status?: string,
  ) => {
    if (!createdAt) return;
    recent.push({ id, kind, title, subtitle, createdAt: String(createdAt), status });
  };

  for (const r of recentPatterns) {
    push(String(r.id), "pattern", "Pattern detected", String(r.description ?? ""), r.createdAt, "active");
  }
  for (const r of recentConsolidations) {
    push(String(r.id), "consolidation", String(r.title ?? ""), "Consolidation", r.createdAt, "active");
  }
  for (const r of recentSuggestions) {
    push(String(r.id), "suggestion", String(r.title ?? ""), "Suggestion", r.createdAt, r.status ? String(r.status) : undefined);
  }
  for (const r of recentConflicts) {
    push(String(r.id), "contradiction", "Conflict", `Category: ${String(r.category)}`, r.createdAt, "unresolved");
  }

  return {
    health: {
      totalActiveMemories: Number(h.activeMemories ?? 0),
      consolidatedMemories: Number(h.consolidatedMemories ?? 0),
      pendingAnalysis: Number(h.pendingAnalysis ?? 0),
      unresolvedConflicts: Number(h.unresolvedConflicts ?? 0),
      failedProcessingJobs: Number(h.failedProcessingJobs ?? 0),
      totalMemories: Number(h.totalMemories ?? 0),
    },
    recent: recent.slice(0, 10),
    activity: {
      totalJobs: Number(j.totalJobs ?? 0),
      completedJobs: Number(j.completedJobs ?? 0),
      failedJobs: Number(j.failedJobs ?? 0),
      retryableJobs: Number(j.retryableJobs ?? 0),
      lastSuccessfulRun: j.lastSuccessfulRun ? String(j.lastSuccessfulRun) : null,
      lastRunAt: j.lastRunAt ? String(j.lastRunAt) : null,
      lastRunError: j.lastRunError ? String(j.lastRunError) : null,
    },
  };
}

/** Count of pending suggestions for a badge. */
export async function countPendingSuggestions(
  userId: string,
  workspaceId: string,
): Promise<number> {
  await assertAccess(userId, workspaceId);
  const rows = await queryTenant<{ count: string }>(
    userId,
    `SELECT COUNT(*)::text AS count FROM suggestions WHERE workspace_id = $1 AND status = 'pending'`,
    [workspaceId],
  );
  return Number(rows[0]?.count ?? 0);
}
