import { queryTenant } from "@/db/client";
import type { MemoryRecord, MemoryRelationship, MemoryType, PrivacyClassification } from "@/db/schema";
import { userHasWorkspaceAccess } from "@/server/data/workspaces";

export interface NewMemoryRecord {
  workspaceId: string;
  memoryType: MemoryType;
  content: string;
  summary?: string | null;
  sourceRef?: string | null;
  confidence?: number | null;
  importance?: number;
  validFrom?: string | null;
  validUntil?: string | null;
  privacyClassification?: PrivacyClassification;
  metadata?: Record<string, unknown>;
}

export async function createMemoryRecord(
  userId: string,
  input: NewMemoryRecord,
): Promise<MemoryRecord> {
  if (!(await userHasWorkspaceAccess(userId, input.workspaceId))) {
    throw new Error("FORBIDDEN");
  }
  const rows = await queryTenant<MemoryRecord>(
    userId,
    `INSERT INTO memory_records (
       workspace_id, owner_id, memory_type, content, summary, source_ref,
       confidence, importance, valid_from, valid_until, privacy_classification, metadata
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING id, workspace_id AS "workspaceId", owner_id AS "ownerId",
               memory_type AS "memoryType", content, summary, source_ref AS "sourceRef",
               confidence, importance, valid_from AS "validFrom",
               valid_until AS "validUntil",
               privacy_classification AS "privacyClassification", metadata,
               created_at AS "createdAt", updated_at AS "updatedAt"`,
    [
      input.workspaceId,
      userId,
      input.memoryType,
      input.content,
      input.summary ?? null,
      input.sourceRef ?? null,
      input.confidence ?? null,
      input.importance ?? 0,
      input.validFrom ?? null,
      input.validUntil ?? null,
      input.privacyClassification ?? "private",
      input.metadata ?? {},
    ],
  );
  return rows[0];
}

export async function listMemoryRecordsInWorkspace(
  userId: string,
  workspaceId: string,
): Promise<MemoryRecord[]> {
  if (!(await userHasWorkspaceAccess(userId, workspaceId))) {
    throw new Error("FORBIDDEN");
  }
  return queryTenant<MemoryRecord>(
    userId,
    `SELECT id, workspace_id AS "workspaceId", owner_id AS "ownerId",
            memory_type AS "memoryType", content, summary, source_ref AS "sourceRef",
            confidence, importance, valid_from AS "validFrom",
            valid_until AS "validUntil",
            privacy_classification AS "privacyClassification", metadata,
            created_at AS "createdAt", updated_at AS "updatedAt"
       FROM memory_records WHERE workspace_id = $1
       ORDER BY created_at DESC`,
    [workspaceId],
  );
}

export interface MemoryStats {
  total: number;
  byType: Record<MemoryType, number>;
}

export async function getMemoryStats(
  userId: string,
  workspaceId: string,
): Promise<MemoryStats> {
  if (!(await userHasWorkspaceAccess(userId, workspaceId))) {
    throw new Error("FORBIDDEN");
  }
  const rows = await queryTenant<{ memoryType: MemoryType; count: string }>(
    userId,
    `SELECT memory_type AS "memoryType", count(*)::text AS count
       FROM memory_records WHERE workspace_id = $1
       GROUP BY memory_type`,
    [workspaceId],
  );
  const byType: Record<MemoryType, number> = {
    episodic: 0,
    semantic: 0,
    procedural: 0,
    associative: 0,
  };
  let total = 0;
  for (const r of rows) {
    const n = Number(r.count ?? 0);
    byType[r.memoryType] = n;
    total += n;
  }
  return { total, byType };
}

export interface NewRelationship {
  sourceMemoryId: string;
  targetMemoryId: string;
  relationshipType: string;
  strength?: number | null;
  metadata?: Record<string, unknown>;
}

export async function createRelationship(
  userId: string,
  workspaceId: string,
  input: NewRelationship,
): Promise<MemoryRelationship> {
  if (!(await userHasWorkspaceAccess(userId, workspaceId))) {
    throw new Error("FORBIDDEN");
  }
  const rows = await queryTenant<MemoryRelationship>(
    userId,
    `INSERT INTO memory_relationships (source_memory_id, target_memory_id, relationship_type, strength, metadata)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, source_memory_id AS "sourceMemoryId",
               target_memory_id AS "targetMemoryId",
               relationship_type AS "relationshipType", strength, metadata,
               created_at AS "createdAt"`,
    [input.sourceMemoryId, input.targetMemoryId, input.relationshipType, input.strength ?? null, input.metadata ?? {}],
  );
  return rows[0];
}
