import { queryTenant } from "@/db/client";
import { userHasWorkspaceAccess } from "@/server/data/workspaces";
import { enqueueJob } from "@/server/memory/queue";
import { preprocessContent } from "@/server/memory/preprocess";
import { contentChecksum, truncate } from "@/server/memory/util";
import type { IngestionInput, IngestionRecord } from "@/server/memory/types";
import { ValidationError } from "@/server/memory/errors";

const INGESTION_COLUMNS = `
  id, workspace_id AS "workspaceId", owner_id AS "ownerId",
  source_type AS "sourceType", source_id AS "sourceId", title,
  checksum, content_preview AS "contentPreview", content_ref AS "contentRef",
  size_bytes AS "sizeBytes", status, error, attempts,
  created_at AS "createdAt", processed_at AS "processedAt", metadata
`;

/**
 * Create an ingestion record and enqueue an extraction job. Idempotent: a
 * second ingest with the same source type + source id + content checksum in
 * the same workspace returns the existing record instead of duplicating.
 *
 * If no AI provider is configured, extraction will be attempted by the job
 * runner and recorded as a retryable failure — the content is preserved and
 * never fabricated into memories.
 */
export async function createIngestion(
  userId: string,
  input: IngestionInput,
): Promise<IngestionRecord> {
  if (!(await userHasWorkspaceAccess(userId, input.workspaceId))) {
    throw new Error("FORBIDDEN");
  }

  const pre = preprocessContent(input.content);
  const checksum = contentChecksum(pre.content);

  // Idempotency: same (workspace, source_type, source_id, checksum).
  const existing = await queryTenant<IngestionRecord>(
    userId,
    `SELECT ${INGESTION_COLUMNS} FROM ingestion_records
     WHERE workspace_id = $1 AND source_type = $2
       AND COALESCE(source_id, '') = COALESCE($3, '')
       AND checksum = $4
     ORDER BY created_at DESC LIMIT 1`,
    [input.workspaceId, input.sourceType, input.sourceId ?? null, checksum],
  );
  if (existing[0]) {
    return existing[0];
  }

  const rows = await queryTenant<IngestionRecord>(
    userId,
    `INSERT INTO ingestion_records (
        workspace_id, owner_id, source_type, source_id, title, checksum,
        content_preview, content_ref, size_bytes, status, metadata
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', $10)
     RETURNING ${INGESTION_COLUMNS}`,
    [
      input.workspaceId,
      userId,
      input.sourceType,
      input.sourceId ?? null,
      input.title ? truncate(input.title, 300) : null,
      checksum,
      pre.preview,
      null,
      pre.sizeBytes,
      input.metadata ?? {},
    ],
  );
  const record = rows[0];

  // Enqueue background extraction (bounded concurrency handled by scheduler).
  await enqueueJob(userId, input.workspaceId, "extraction", record.id);

  return record;
}

export async function getIngestion(
  userId: string,
  ingestionId: string,
): Promise<IngestionRecord | null> {
  const rows = await queryTenant<IngestionRecord>(
    userId,
    `SELECT ${INGESTION_COLUMNS} FROM ingestion_records WHERE id = $1`,
    [ingestionId],
  );
  return rows[0] ?? null;
}

export interface IngestionSummary {
  id: string;
  workspaceId: string;
  sourceType: string;
  title: string | null;
  contentPreview: string;
  status: IngestionRecord["status"];
  error: string | null;
  createdAt: string;
  processedAt: string | null;
}

export async function listIngestionsForUser(
  userId: string,
  opts: { status?: string; limit?: number; offset?: number } = {},
): Promise<IngestionSummary[]> {
  const limit = Math.min(opts.limit ?? 50, 200);
  const offset = opts.offset ?? 0;
  const rows = await queryTenant<IngestionSummary>(
    userId,
    `SELECT id, workspace_id AS "workspaceId", source_type AS "sourceType", title,
            content_preview AS "contentPreview", status, error,
            created_at AS "createdAt", processed_at AS "processedAt"
       FROM ingestion_records i
       WHERE i.owner_id = $1 AND ($2::text IS NULL OR i.status = $2)
       ORDER BY i.created_at DESC
       LIMIT $3 OFFSET $4`,
    [userId, opts.status ?? null, limit, offset],
  );
  return rows;
}

export async function setIngestionStatus(
  ingestionId: string,
  status: IngestionRecord["status"],
  error: string | null,
): Promise<void> {
  const rows = await queryTenant(
    null,
    `UPDATE ingestion_records SET status = $2, error = $3,
            processed_at = CASE WHEN $2 IN ('completed','failed','retryable') THEN now() ELSE processed_at END
     WHERE id = $1`,
    [ingestionId, status, error],
  );
  void rows;
}

/** Increment attempt counter on an ingestion record. */
export async function bumpIngestionAttempt(ingestionId: string): Promise<void> {
  await queryTenant(
    null,
    `UPDATE ingestion_records SET attempts = attempts + 1 WHERE id = $1`,
    [ingestionId],
  );
}

export function requireValidIngestionInput(input: IngestionInput): void {
  if (!input.workspaceId || typeof input.workspaceId !== "string") {
    throw new ValidationError("workspaceId is required.");
  }
  if (input.sourceType !== "text" && input.sourceType !== "note" && input.sourceType !== "markdown" && input.sourceType !== "txt" && input.sourceType !== "conversation" && input.sourceType !== "api") {
    throw new ValidationError("Unsupported source type.");
  }
}
