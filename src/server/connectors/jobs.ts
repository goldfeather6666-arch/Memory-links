import { queryRaw } from "@/db/client";
import { enqueueJob } from "@/server/memory/queue";
import { runSync } from "@/server/connectors/sync";

/**
 * Background connector sync jobs.
 *
 * Connector syncs run on the shared in-database job queue. The queue only
 * stores the target (connection) id; for background jobs we default the
 * trigger to 'scheduled' (manual runs call `runSync` directly and therefore
 * pass their trigger explicitly).
 */

interface ConnectionRow {
  workspaceId: string;
}

async function loadConnectionWorkspaceId(connectionId: string): Promise<string | null> {
  const rows = await queryRaw<ConnectionRow>(
    `SELECT workspace_id AS "workspaceId" FROM connections WHERE id = $1`,
    [connectionId],
  );
  return rows[0]?.workspaceId ?? null;
}

/**
 * Enqueue a connector sync job. The job carries only the target connection id;
 * background execution uses the 'scheduled' trigger (queued jobs cannot carry
 * the original trigger without a metadata column).
 */
export async function enqueueConnectorSync(
  userId: string,
  workspaceId: string,
  connectionId: string,
  trigger: "manual" | "scheduled" | "webhook" | "initial",
): Promise<void> {
  // Trigger is intentionally not persisted: the queue only stores target_id.
  // Manual/initial web are driven inline by their callers; background jobs are
  // executed as 'scheduled'. See processConnectorSyncJob below.
  void trigger;
  await enqueueJob(userId, workspaceId, "connector_sync", connectionId);
}

/**
 * Job dispatcher handler for connector_sync jobs. Loads the connection to
 * recover its workspace, then runs a scheduled sync as the job owner.
 */
export async function processConnectorSyncJob(
  ownerId: string,
  targetId: string,
): Promise<void> {
  const workspaceId = await loadConnectionWorkspaceId(targetId);
  if (!workspaceId) {
    throw new Error("CONNECTION_NOT_FOUND");
  }
  await runSync(ownerId, workspaceId, targetId, "scheduled");
}
