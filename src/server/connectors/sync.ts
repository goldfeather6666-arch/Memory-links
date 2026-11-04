/**
 * MNEMOSYNE Part 8 — sync orchestration for data connectors.
 *
 * Runs a bounded fetch loop over the provider adapter, feeds each page
 * through the processing pipeline, and records run accounting in sync_runs.
 * Connection state and sync metadata are advanced on success.
 */

import { queryTenant } from "@/db/client";
import { userHasWorkspaceAccess } from "@/server/data/workspaces";
import { getConnection, updateConnectionStatus } from "@/server/connectors/connections";
import { getAccessToken } from "@/server/connectors/oauth";
import { getConnectorAdapter } from "@/server/connectors/clients";
import { processBatch } from "@/server/connectors/pipeline";
import { isRetryableError } from "@/server/memory/errors";
import type {
  ConnectionRecord,
  ConnectionStatus,
  SyncResult,
} from "@/server/connectors/types";

const MAX_PAGES = 10;
const STATUS_CONNECTED: ConnectionStatus = "connected";
const STATUS_PAUSED: ConnectionStatus = "paused";
const STATUS_FAILED: ConnectionStatus = "failed";
const STATUS_SYNCING: ConnectionStatus = "syncing";

const EMPTY_RESULT: SyncResult = {
  discovered: 0,
  imported: 0,
  updated: 0,
  skipped: 0,
  failed: 0,
};

function addResults(dst: SyncResult, src: SyncResult): void {
  dst.discovered += src.discovered;
  dst.imported += src.imported;
  dst.updated += src.updated;
  dst.skipped += src.skipped;
  dst.failed += src.failed;
  if (src.error) dst.error = src.error;
}

async function insertSyncRun(userId, connection, trigger) {
  const rows = await queryTenant<{ id: string }>(
    userId,
    `INSERT INTO sync_runs (connection_id, workspace_id, owner_id, trigger, status, started_at)
     VALUES ($1, $2, $3, $4, 'running', now())
     RETURNING id`,
    [connection.id, connection.workspaceId, userId, trigger],
  );
  return rows[0].id;
}

async function finalizeSyncRun(userId, runId, status, result, nextRunAt, error) {
  await queryTenant(
    userId,
    `UPDATE sync_runs
        SET status = $2,
            records_discovered = $3,
            records_imported = $4,
            records_updated = $5,
            records_skipped = $6,
            records_failed = $7,
            next_run_at = $8,
            error = $9,
            finished_at = now()
      WHERE id = $1`,
    [runId, status, result.discovered, result.imported, result.updated, result.skipped, result.failed, nextRunAt, error ?? null],
  );
}

function computeNextRunAt(connection, now) {
  if (!connection.syncIntervalMin || connection.syncIntervalMin <= 0) return null;
  return new Date(now.getTime() + connection.syncIntervalMin * 60_000).toISOString();
}

async function persistSyncMeta(userId, workspaceId, connectionId, nextRunAt) {
  await queryTenant(
    userId,
    `UPDATE connections SET last_sync_at = now(), next_sync_at = $3
      WHERE id = $1 AND workspace_id = $2`,
    [connectionId, workspaceId, nextRunAt],
  );
}

/**
 * Run a full sync for one connection. Throws on hard failures after recording
 * the failed run and marking the connection failed (unless retryable).
 */
export async function runSync(
  userId: string,
  workspaceId: string,
  connectionId: string,
  trigger: "manual" | "scheduled" | "webhook" | "initial",
): Promise<SyncResult> {
  if (!(await userHasWorkspaceAccess(userId, workspaceId))) {
    throw new Error("FORBIDDEN");
  }

  const connection = await getConnection(userId, workspaceId, connectionId);
  if (!connection) throw new Error("CONNECTION_NOT_FOUND");
  if (connection.workspaceId !== workspaceId) throw new Error("FORBIDDEN");

  if (connection.status === STATUS_PAUSED) {
    return { ...EMPTY_RESULT, error: "PAUSED" };
  }
  if (connection.status !== STATUS_CONNECTED) {
    throw new Error("CONNECTION_NOT_CONNECTED");
  }

  const runId = await insertSyncRun(userId, connection, trigger);
  await updateConnectionStatus(userId, workspaceId, connectionId, STATUS_SYNCING);

  const result: SyncResult = { ...EMPTY_RESULT };

  try {
    const accessToken = await getAccessToken(userId, workspaceId, connectionId);
    const adapter = getConnectorAdapter(connection.provider);
    if (!adapter) throw new Error("UNSUPPORTED_PROVIDER");

    const useChanges = trigger !== "initial" && typeof adapter.fetchChanges === "function";
    let cursor: string | null = null;

    for (let page = 0; page < MAX_PAGES; page++) {
      const fetch =
        useChanges && adapter.fetchChanges
          ? adapter.fetchChanges.bind(adapter)
          : adapter.fetchInitial.bind(adapter);
      const res = await fetch({ accessToken, cursor: cursor ?? undefined });
      const pageResult = await processBatch(userId, connection, res.items);
      addResults(result, pageResult);
      cursor = res.nextCursor ?? null;
      if (!cursor || res.items.length === 0) break;
    }

    const now = new Date();
    const nextRunAt = computeNextRunAt(connection, now);
    await persistSyncMeta(userId, workspaceId, connectionId, nextRunAt);
    await updateConnectionStatus(userId, workspaceId, connectionId, STATUS_CONNECTED);
    await finalizeSyncRun(userId, runId, "completed", result, nextRunAt, null);
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await finalizeSyncRun(userId, runId, "failed", result, null, message);
    await updateConnectionStatus(
      userId,
      workspaceId,
      connectionId,
      isRetryableError(err) ? STATUS_SYNCING : STATUS_FAILED,
    );
    throw err;
  }
}

export async function runInitialSync(userId, workspaceId, connectionId) {
  return runSync(userId, workspaceId, connectionId, "initial");
}

export function shouldRunScheduled(connection, now) {
  if (!connection.syncIntervalMin || connection.syncIntervalMin <= 0) return false;
  if (!connection.nextSyncAt) return true;
  return new Date(connection.nextSyncAt).getTime() <= now.getTime();
}
