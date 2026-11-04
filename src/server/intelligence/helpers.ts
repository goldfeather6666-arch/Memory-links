/**
 * Shared column snippets + row mappers for intelligence tables. Keeps SELECT
 * lists consistent across modules and maps snake_case rows to camelCase types.
 */

import type { QueryResultRow as PgRow } from "pg";
import type {
  ContradictionRecord,
  ConsolidationRecord,
  IntelligenceJobRecord,
  PatternRecord,
  SuggestionRecord,
} from "./types";

// --- Contradictions ---------------------------------------------------------

export const CONTRADICTION_SELECT = `
  id, workspace_id AS "workspaceId", owner_id AS "ownerId",
  memory_id_a AS "memoryIdA", memory_id_b AS "memoryIdB",
  category, evidence, confidence, status,
  resolution_metadata AS "resolutionMetadata",
  created_at AS "createdAt", updated_at AS "updatedAt"
`;

export function mapContradictionRow(row: PgRow): ContradictionRecord {
  return {
    id: String(row.id),
    workspaceId: String(row.workspaceId),
    ownerId: String(row.ownerId),
    memoryIdA: String(row.memoryIdA),
    memoryIdB: String(row.memoryIdB),
    category: row.category,
    evidence: (row.evidence as Record<string, unknown>) ?? {},
    confidence: row.confidence !== null && row.confidence !== undefined ? Number(row.confidence) : null,
    status: row.status,
    resolutionMetadata: (row.resolutionMetadata as Record<string, unknown>) ?? {},
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
  };
}

// --- Consolidations ----------------------------------------------------------

export const CONSOLIDATION_SELECT = `
  id, workspace_id AS "workspaceId", owner_id AS "ownerId",
  kind, title, summary, supporting_memory_ids AS "supportingMemoryIds",
  source_refs AS "sourceRefs", confidence, status, meta, version,
  created_at AS "createdAt", updated_at AS "updatedAt"
`;

export function mapConsolidationRow(row: PgRow): ConsolidationRecord {
  return {
    id: String(row.id),
    workspaceId: String(row.workspaceId),
    ownerId: String(row.ownerId),
    kind: row.kind,
    title: String(row.title),
    summary: String(row.summary),
    supportingMemoryIds: (row.supportingMemoryIds as string[]) ?? [],
    sourceRefs: (row.sourceRefs as Record<string, unknown>[]) ?? [],
    confidence: row.confidence !== null && row.confidence !== undefined ? Number(row.confidence) : null,
    status: row.status,
    meta: (row.meta as Record<string, unknown>) ?? {},
    version: Number(row.version ?? 1),
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
  };
}

// --- Patterns ----------------------------------------------------------------

export const PATTERN_SELECT = `
  id, workspace_id AS "workspaceId", owner_id AS "ownerId",
  pattern_type AS "patternType", description, supporting_memory_ids AS "supportingMemoryIds",
  confidence, first_observed_at AS "firstObservedAt", last_observed_at AS "lastObservedAt",
  status, meta, created_at AS "createdAt", updated_at AS "updatedAt"
`;

export function mapPatternRow(row: PgRow): PatternRecord {
  return {
    id: String(row.id),
    workspaceId: String(row.workspaceId),
    ownerId: String(row.ownerId),
    patternType: row.patternType,
    description: String(row.description),
    supportingMemoryIds: (row.supportingMemoryIds as string[]) ?? [],
    confidence: row.confidence !== null && row.confidence !== undefined ? Number(row.confidence) : null,
    firstObservedAt: String(row.firstObservedAt),
    lastObservedAt: String(row.lastObservedAt),
    status: row.status,
    meta: (row.meta as Record<string, unknown>) ?? {},
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
  };
}

// --- Suggestions --------------------------------------------------------------

export const SUGGESTION_SELECT = `
  id, workspace_id AS "workspaceId", owner_id AS "ownerId",
  suggestion_type AS "suggestionType", title, body, evidence, status,
  target_memory_id AS "targetMemoryId", decided_at AS "decidedAt",
  created_at AS "createdAt", updated_at AS "updatedAt"
`;

export function mapSuggestionRow(row: PgRow): SuggestionRecord {
  return {
    id: String(row.id),
    workspaceId: String(row.workspaceId),
    ownerId: String(row.ownerId),
    suggestionType: row.suggestionType,
    title: String(row.title),
    body: String(row.body),
    evidence: (row.evidence as Record<string, unknown>) ?? {},
    status: row.status,
    targetMemoryId: row.targetMemoryId ? String(row.targetMemoryId) : null,
    decidedAt: row.decidedAt ? String(row.decidedAt) : null,
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
  };
}

// --- Intelligence jobs --------------------------------------------------------

export const INTELLIGENCE_JOB_SELECT = `
  id, workspace_id AS "workspaceId", owner_id AS "ownerId",
  kind, trigger_type AS "triggerType", state, attempts, max_attempts AS "maxAttempts",
  run_after AS "runAfter", locked_by AS "lockedBy", locked_at AS "lockedAt",
  last_error AS "lastError", timeout_after AS "timeoutAfter",
  idempotency_key AS "idempotencyKey", settings,
  created_at AS "createdAt", updated_at AS "updatedAt"
`;

export function mapIntelligenceJobRow(row: PgRow): IntelligenceJobRecord {
  return {
    id: String(row.id),
    workspaceId: String(row.workspaceId),
    ownerId: String(row.ownerId),
    kind: row.kind,
    triggerType: row.triggerType,
    state: row.state,
    attempts: Number(row.attempts ?? 0),
    maxAttempts: Number(row.maxAttempts ?? 3),
    runAfter: String(row.runAfter),
    lockedBy: row.lockedBy ? String(row.lockedBy) : null,
    lockedAt: row.lockedAt ? String(row.lockedAt) : null,
    lastError: row.lastError ? String(row.lastError) : null,
    timeoutAfter: String(row.timeoutAfter),
    idempotencyKey: row.idempotencyKey ? String(row.idempotencyKey) : null,
    settings: (row.settings as Record<string, unknown>) ?? {},
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
  };
}
