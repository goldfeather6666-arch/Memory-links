import { createHash } from "crypto";
import { queryTenant, withTenant } from "@/db/client";

interface DbClient {
  query(text: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}
import { userHasWorkspaceAccess } from "@/server/data/workspaces";
import type { MemoryType, PrivacyClassification } from "@/db/schema";
import type {
  EntityRef,
  ExtractedFact,
  MemoryState,
  MemoryView,
  MemoryVersionView,
} from "@/server/memory/types";

export const MEMORY_SELECT = `
  id, workspace_id AS "workspaceId", owner_id AS "ownerId",
  memory_type AS "memoryType", state, content, summary, source_ref AS "sourceRef",
  confidence, importance, valid_from AS "validFrom", valid_until AS "validUntil",
  privacy_classification AS "privacyClassification", metadata,
  version, embedding_model AS "embeddingModel", embedding_dim AS "embeddingDim",
  created_at AS "createdAt", updated_at AS "updatedAt"
`;

export function mapMemoryRow(row: Record<string, unknown>): MemoryView {
  return {
    id: String(row.id),
    workspaceId: String(row.workspaceId),
    ownerId: String(row.ownerId),
    memoryType: row.memoryType as MemoryType,
    state: row.state as MemoryState,
    content: String(row.content),
    summary: row.summary ? String(row.summary) : null,
    sourceRef: row.sourceRef ? String(row.sourceRef) : null,
    confidence: row.confidence !== null && row.confidence !== undefined ? Number(row.confidence) : null,
    importance: Number(row.importance ?? 0),
    validFrom: row.validFrom ? String(row.validFrom) : null,
    validUntil: row.validUntil ? String(row.validUntil) : null,
    privacyClassification: row.privacyClassification as PrivacyClassification,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    version: Number(row.version ?? 1),
    embeddingModel: row.embeddingModel ? String(row.embeddingModel) : null,
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
  };
}

async function insertEntityRows(client: DbClient, memoryId: string, entities: EntityRef[]): Promise<void> {
  if (entities.length === 0) return;
  for (const e of entities) {
    await client.query(
      `INSERT INTO memory_entities (memory_id, entity_type, entity_value, confidence)
       VALUES ($1, $2, $3, $4)`,
      [memoryId, e.type, e.value, e.confidence],
    );
  }
}

export interface InsertMemoryOptions {
  sourceRef?: string | null;
  ingestionId?: string;
  reason?: string;
}

export async function insertMemoryFromFact(
  userId: string,
  workspaceId: string,
  fact: ExtractedFact,
  opts: InsertMemoryOptions = {},
): Promise<MemoryView> {
  if (!(await userHasWorkspaceAccess(userId, workspaceId))) {
    throw new Error("FORBIDDEN");
  }
  const metadata: Record<string, unknown> = {
    engine: "part3",
    generation: "ai",
    content_hash: hash(fact.content),
    ...(opts.ingestionId ? { ingestion_id: opts.ingestionId } : {}),
    ...(opts.reason ? { reason: opts.reason } : {}),
  };

  return withTenant(userId, async (client) => {
    const res = await client.query(
      `INSERT INTO memory_records (
          workspace_id, owner_id, memory_type, content, summary, source_ref,
          confidence, valid_from, valid_until, privacy_classification, metadata,
          state, version
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'active', 1)
       RETURNING ${MEMORY_SELECT}`,
      [
        workspaceId,
        userId,
        fact.memoryType,
        fact.content,
        fact.summary,
        opts.sourceRef ?? null,
        fact.confidence,
        fact.validFrom,
        fact.validUntil,
        "private",
        metadata,
      ],
    );
    const row = res.rows[0];
    const view = mapMemoryRow(row);

    await client.query(
      `INSERT INTO memory_versions (memory_id, version, content, summary, memory_type, confidence, metadata, change_reason, created_by)
       VALUES ($1, 1, $2, $3, $4, $5, $6, $7, $8)`,
      [view.id, fact.content, fact.summary, fact.memoryType, fact.confidence, metadata, opts.reason ?? "created", userId],
    );

    await insertEntityRows(client, view.id, fact.entities);
    return view;
  });
}

export async function getMemory(userId: string, memoryId: string): Promise<MemoryView | null> {
  const rows = await queryTenant<Record<string, unknown>>(
    userId,
    `SELECT ${MEMORY_SELECT} FROM memory_records WHERE id = $1`,
    [memoryId],
  );
  const view = rows[0] ? mapMemoryRow(rows[0]) : null;
  if (!view) return null;
  if (!(await userHasWorkspaceAccess(userId, view.workspaceId))) {
    return null;
  }
  return view;
}

export interface MemoryPatch {
  content?: string;
  summary?: string | null;
  memoryType?: MemoryType;
  confidence?: number | null;
  validFrom?: string | null;
  validUntil?: string | null;
  privacyClassification?: PrivacyClassification;
  importance?: number;
  changeReason?: string;
}

export async function updateMemory(
  userId: string,
  memoryId: string,
  patch: MemoryPatch,
): Promise<MemoryView | null> {
  const existing = await getMemory(userId, memoryId);
  if (!existing) return null;
  if (!(await userHasWorkspaceAccess(userId, existing.workspaceId))) {
    throw new Error("FORBIDDEN");
  }

  return withTenant(userId, async (client) => {
    await client.query(
      `INSERT INTO memory_versions (memory_id, version, content, summary, memory_type, confidence, metadata, change_reason, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        memoryId,
        existing.version,
        existing.content,
        existing.summary,
        existing.memoryType,
        existing.confidence,
        existing.metadata,
        patch.changeReason ?? "updated",
        userId,
      ],
    );

    const res = await client.query(
      `UPDATE memory_records SET
          content = COALESCE($2, content),
          summary = COALESCE($3, summary),
          memory_type = COALESCE($4, memory_type),
          confidence = COALESCE($5, confidence),
          valid_from = COALESCE($6, valid_from),
          valid_until = COALESCE($7, valid_until),
          privacy_classification = COALESCE($8, privacy_classification),
          importance = COALESCE($9, importance),
          version = version + 1
       WHERE id = $1
       RETURNING ${MEMORY_SELECT}`,
      [
        memoryId,
        patch.content ?? null,
        patch.summary ?? null,
        patch.memoryType ?? null,
        patch.confidence ?? null,
        patch.validFrom ?? null,
        patch.validUntil ?? null,
        patch.privacyClassification ?? null,
        patch.importance ?? null,
      ],
    );
    return res.rows[0] ? mapMemoryRow(res.rows[0]) : null;
  });
}

export async function setMemoryState(
  userId: string,
  memoryId: string,
  state: MemoryState,
  reason = "state_change",
): Promise<MemoryView | null> {
  const existing = await getMemory(userId, memoryId);
  if (!existing) return null;
  if (!(await userHasWorkspaceAccess(userId, existing.workspaceId))) {
    throw new Error("FORBIDDEN");
  }
  const metadata =
    state === "deleted"
      ? { ...existing.metadata, deleted_at: new Date().toISOString() }
      : existing.metadata;
  const rows = await queryTenant<Record<string, unknown>>(
    userId,
    `UPDATE memory_records SET state = $2, metadata = $3 WHERE id = $1
     RETURNING ${MEMORY_SELECT}`,
    [memoryId, state, metadata],
  );
  if (rows[0]) {
    await recordVersionChange(userId, memoryId, existing, reason);
  }
  return rows[0] ? mapMemoryRow(rows[0]) : null;
}

async function recordVersionChange(
  userId: string,
  memoryId: string,
  prior: MemoryView,
  reason: string,
): Promise<void> {
  await queryTenant(
    userId,
    `INSERT INTO memory_versions (memory_id, version, content, summary, memory_type, confidence, metadata, change_reason, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      memoryId,
      prior.version,
      prior.content,
      prior.summary,
      prior.memoryType,
      prior.confidence,
      prior.metadata,
      reason,
      userId,
    ],
  );
}

export async function deleteMemoryHard(userId: string, memoryId: string): Promise<boolean> {
  const memory = await getMemory(userId, memoryId);
  if (!memory) return false;
  const res = await queryTenant(
    userId,
    `DELETE FROM memory_records WHERE id = $1`,
    [memoryId],
  );
  return (res as unknown as { rowCount: number }).rowCount > 0;
}

export async function getMemoryEntities(
  userId: string,
  memoryId: string,
): Promise<{ type: string; value: string; confidence: number }[]> {
  const memory = await getMemory(userId, memoryId);
  if (!memory) return [];
  const rows = await queryTenant<{ type: string; value: string; confidence: number }>(
    userId,
    `SELECT entity_type AS type, entity_value AS value,
            COALESCE(confidence, 0) AS confidence
       FROM memory_entities WHERE memory_id = $1 ORDER BY confidence DESC`,
    [memoryId],
  );
  return rows;
}

export async function getMemoryVersions(
  userId: string,
  memoryId: string,
): Promise<MemoryVersionView[]> {
  const memory = await getMemory(userId, memoryId);
  if (!memory) return [];
  const rows = await queryTenant<Record<string, unknown>>(
    userId,
    `SELECT id, memory_id AS "memoryId", version, content, summary,
            memory_type AS "memoryType", confidence, metadata,
            change_reason AS "changeReason", created_by AS "createdBy",
            created_at AS "createdAt"
       FROM memory_versions WHERE memory_id = $1 ORDER BY version DESC`,
    [memoryId],
  );
  return rows.map((r) => ({
    id: String(r.id),
    memoryId: String(r.memoryId),
    version: Number(r.version),
    content: String(r.content),
    summary: r.summary ? String(r.summary) : null,
    memoryType: r.memoryType as MemoryType,
    confidence: r.confidence !== null && r.confidence !== undefined ? Number(r.confidence) : null,
    metadata: (r.metadata as Record<string, unknown>) ?? {},
    changeReason: r.changeReason ? String(r.changeReason) : null,
    createdBy: r.createdBy ? String(r.createdBy) : null,
    createdAt: String(r.createdAt),
  }));
}

export interface ListMemoriesOptions {
  memoryTypes?: MemoryType[];
  states?: MemoryState[];
  query?: string;
  limit?: number;
  offset?: number;
}

export async function listMemories(
  userId: string,
  workspaceId: string,
  opts: ListMemoriesOptions = {},
): Promise<{ items: MemoryView[]; total: number }> {
  if (!(await userHasWorkspaceAccess(userId, workspaceId))) {
    throw new Error("FORBIDDEN");
  }
  const types = opts.memoryTypes?.length ? opts.memoryTypes : null;
  const states = opts.states?.length ? opts.states : ["active"];
  const limit = Math.min(opts.limit ?? 20, 200);
  const offset = opts.offset ?? 0;

  const where = [`workspace_id = $1`];
  const values: unknown[] = [workspaceId];
  if (types) {
    values.push(types);
    where.push(`memory_type = ANY($${values.length})`);
  }
  values.push(states);
  where.push(`state = ANY($${values.length})`);
  if (opts.query && opts.query.trim()) {
    values.push(opts.query.trim());
    where.push(`to_tsvector('english', content || ' ' || coalesce(summary, '')) @@ plainto_tsquery('english', $${values.length})`);
  }

  const whereSql = where.join(" AND ");
  const countRows = await queryTenant<{ count: string }>(
    userId,
    `SELECT count(*)::text AS count FROM memory_records WHERE ${whereSql}`,
    values,
  );
  const total = Number(countRows[0]?.count ?? 0);

  values.push(limit, offset);
  const rows = await queryTenant<Record<string, unknown>>(
    userId,
    `SELECT ${MEMORY_SELECT} FROM memory_records
     WHERE ${whereSql}
     ORDER BY created_at DESC
     LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values,
  );
  return { items: rows.map(mapMemoryRow), total };
}

function hash(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}
