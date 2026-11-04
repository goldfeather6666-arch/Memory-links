import { queryTenant } from "@/db/client";
import { createIngestion } from "@/server/memory/ingestion";
import { computeContentHash, summarizeSource } from "@/server/connectors/normalize";
import type {
  ConnectionRecord,
  NormalizedSource,
  SyncResult,
} from "@/server/connectors/types";

/**
 * Connector processing pipeline: turns normalized sources into ingestions.
 *
 * Deduplication is keyed by (connection_id, external_id) in `connection_sources`:
 * - same content hash -> duplicate (just refresh last_synced),
 * - different content hash -> update the source row and re-ingest,
 * - brand new row -> insert and ingest.
 *
 * All reads/writes run under the user's tenant scope (RLS on
 * `connection_sources` requires workspace_policy_ok / owner check).
 */

function joinTitleContent(source: NormalizedSource): string {
  // A source with no meaningful body content is skipped regardless of title.
  if (!source.content || !source.content.trim()) {
    return "";
  }
  return [source.title, source.content].filter(Boolean).join("\n\n").trim();
}

interface SourceRow {
  id: string;
  contentHash: string | null;
}

async function upsertSource(
  userId: string,
  connection: ConnectionRecord,
  source: NormalizedSource,
  hash: string,
  ingestionId: string,
): Promise<void> {
  await queryTenant(
    userId,
    `INSERT INTO connection_sources (
       connection_id, workspace_id, owner_id, external_id, record_type, title,
       url, parent_id, thread_id, author, content_hash, source_timestamp,
       modified_at, status, last_ingestion_id, metadata, last_synced
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'active',$14,$15, now())
     ON CONFLICT (connection_id, external_id) DO UPDATE SET
       content_hash = EXCLUDED.content_hash,
       title = EXCLUDED.title,
       url = EXCLUDED.url,
       parent_id = EXCLUDED.parent_id,
       thread_id = EXCLUDED.thread_id,
       author = EXCLUDED.author,
       source_timestamp = EXCLUDED.source_timestamp,
       modified_at = EXCLUDED.modified_at,
       metadata = EXCLUDED.metadata,
       last_ingestion_id = EXCLUDED.last_ingestion_id,
       last_synced = now()`,
    [
      connection.id,
      source.workspaceId,
      userId,
      source.externalId,
      source.recordType,
      source.title,
      source.url,
      source.parentId,
      source.threadId,
      source.author,
      hash,
      source.timestamp,
      source.modifiedAt,
      ingestionId,
      source.metadata,
    ],
  );
}

/**
 * Process a single normalized source. See module doc for the decision tree.
 */
export async function processSource(
  userId: string,
  connection: ConnectionRecord,
  source: NormalizedSource,
): Promise<{
  action: "imported" | "duplicate" | "skipped" | "failed";
  ingestionId?: string;
  error?: string;
}> {
  // The source must belong to the connection's workspace.
  if (source.workspaceId !== connection.workspaceId) {
    return { action: "failed", error: "WORKSPACE_MISMATCH" };
  }

  const content = joinTitleContent(source);
  if (!content) {
    return { action: "skipped" };
  }

  const hash = computeContentHash(source);

  try {
    const existing = await queryTenant<SourceRow>(
      userId,
      `SELECT id, content_hash AS "contentHash"
         FROM connection_sources
        WHERE connection_id = $1 AND external_id = $2`,
      [connection.id, source.externalId],
    );

    // Same hash + already known -> duplicate; just refresh last_synced.
    if (existing[0] && existing[0].contentHash === hash) {
      await queryTenant(
        userId,
        `UPDATE connection_sources SET last_synced = now() WHERE id = $1`,
        [existing[0].id],
      );
      return { action: "duplicate" };
    }

    const ingestion = await createIngestion(userId, {
      workspaceId: source.workspaceId,
      sourceType: "connector",
      sourceId: `${source.provider}:${source.externalId}`,
      title: summarizeSource(source),
      content,
      metadata: {
        provider: source.provider,
        connectionId: connection.id,
        externalId: source.externalId,
        recordType: source.recordType,
        url: source.url ?? undefined,
        author: source.author ?? undefined,
        timestamp: source.timestamp ?? undefined,
        modifiedAt: source.modifiedAt ?? undefined,
      },
    });

    await upsertSource(userId, connection, source, hash, ingestion.id);
    return { action: "imported", ingestionId: ingestion.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { action: "failed", error: message };
  }
}

/**
 * Process a batch of normalized sources and aggregate per-run counters.
 */
export async function processBatch(
  userId: string,
  connection: ConnectionRecord,
  sources: NormalizedSource[],
): Promise<SyncResult> {
  const result: SyncResult = {
    discovered: sources.length,
    imported: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
  };

  for (const source of sources) {
    const outcome = await processSource(userId, connection, source);
    if (outcome.action === "imported") {
      result.imported += 1;
    } else if (outcome.action === "skipped") {
      result.skipped += 1;
    } else if (outcome.action === "failed") {
      result.failed += 1;
      result.error = outcome.error;
    }
    // 'duplicate' is intentionally not counted: it is neither a new import,
    // an update nor a failure in the run aggregates.
  }

  return result;
}
