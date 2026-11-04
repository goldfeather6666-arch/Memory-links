/**
 * MNEMOSYNE Part 4 — explainable memory importance scoring.
 *
 * Importance is a weighted sum of evidence-backed factors, each carrying a
 * transparent explanation. Recency is a LOW-weight ranking-only signal
 * (never dominant, never used for deletion). Nothing here ever deletes
 * memories — decay only affects ranking, not retention.
 *
 * Markers (important / pinned / temporary / long_term / exclude_from_consolidation)
 * are stored under metadata.intelligence and can be toggled by the user.
 */

import { queryTenant } from "@/db/client";
import { userHasWorkspaceAccess } from "@/server/data/workspaces";
import { clamp01 } from "@/server/memory/util";
import { mapMemoryRow, MEMORY_SELECT } from "@/server/memory/storage";
import type { MemoryView } from "@/server/memory/types";
import type {
  ImportanceDecision,
  ImportanceExplanation,
  ImportanceFactor,
  ImportanceMarker,
  MarkMemoryInput,
} from "./types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Recency decay half-life in days. Only affects the low-weight rank signal. */
const RECENCY_HALF_LIFE_DAYS = 90;
const FRESH_WINDOW_DAYS = 7;
const CHURN_THRESHOLD = 0.02;
const DEFAULT_BATCH_LIMIT = 300;
const MAX_BATCH_LIMIT = 2000;

interface FactorSpec {
  name: string;
  weight: number;
  compute(memory: ScoreInput, ctx: FactorContext): { value: number; explanation: string };
}

interface ScoreInput {
  id: string;
  memoryType: string;
  importance: number;
  metadata: Record<string, unknown>;
  createdAt: string;
  occurredAt: string | null;
  entityCount: number;
  relationshipCount: number;
  projectReferenced: boolean;
}

interface FactorContext {
  intelligenceMeta: Record<string, unknown>;
  daysSinceEntry: number;
}

const FACTORS: FactorSpec[] = [
  {
    name: "user_declared",
    weight: 0.3,
    compute(memory, ctx) {
      const meta = ctx.intelligenceMeta;
      if (meta.pinned === true || meta.important === true) {
        return { value: 1, explanation: "You marked this memory important/pinned." };
      }
      if (meta.temporary === true) {
        return { value: 0.2, explanation: "You marked this memory as temporary." };
      }
      if (meta.longTerm === true) {
        return { value: 0.9, explanation: "You marked this memory as long-term." };
      }
      return { value: 0, explanation: "No user-declared importance marker." };
    },
  },
  {
    name: "repeated_reference",
    weight: 0.2,
    compute(memory) {
      const raw = clamp01(memory.entityCount / 5);
      return {
        value: raw,
        explanation: `${memory.entityCount} entity reference(s) recorded.`,
      };
    },
  },
  {
    name: "project_relevance",
    weight: 0.2,
    compute(memory) {
      return {
        value: memory.projectReferenced ? 0.8 : 0,
        explanation: memory.projectReferenced
          ? "Relates to a project entity."
          : "No project connection identified.",
      };
    },
  },
  {
    name: "relationship_connectivity",
    weight: 0.15,
    compute(memory) {
      const raw = clamp01(memory.relationshipCount / 4);
      return { value: raw, explanation: `${memory.relationshipCount} relationship link(s).` };
    },
  },
  {
    name: "future_usefulness",
    weight: 0.1,
    compute(memory) {
      const useful = memory.memoryType === "procedural" || memory.memoryType === "semantic";
      return {
        value: useful ? 0.6 : 0.2,
        explanation: useful
          ? "Procedural/semantic memory is likely reusable."
          : "Episodic memory.",
      };
    },
  },
  {
    name: "recency",
    weight: 0.05,
    compute(_memory, ctx) {
      if (ctx.daysSinceEntry <= FRESH_WINDOW_DAYS) {
        return { value: 1, explanation: "Recently recorded (ranking signal only)." };
      }
      const value = Math.exp(
        -(ctx.daysSinceEntry - FRESH_WINDOW_DAYS) / RECENCY_HALF_LIFE_DAYS,
      );
      return { value: clamp01(value), explanation: "Recency decay signal." };
    },
  },
];

const MARKER_KEYS: Record<ImportanceMarker, string> = {
  important: "important",
  pinned: "pinned",
  temporary: "temporary",
  long_term: "longTerm",
  exclude_from_consolidation: "excludeFromConsolidation",
};

// ---------------------------------------------------------------------------
// Pure scoring
// ---------------------------------------------------------------------------

function daysBetween(iso: string, now: number): number {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return Number.POSITIVE_INFINITY;
  return (now - t) / (24 * 3600 * 1000);
}

/** Pure, deterministic importance score + full explanation. */
export function scoreImportance(memory: ScoreInput): ImportanceDecision {
  const now = Date.now();
  const intelligenceMeta = (memory.metadata?.intelligence as Record<string, unknown>) ?? {};
  const daysSinceEntry = Math.max(0, daysBetween(memory.createdAt, now));

  const ctx: FactorContext = { intelligenceMeta, daysSinceEntry };
  const factors: ImportanceFactor[] = [];
  let score = 0;

  for (const f of FACTORS) {
    const { value, explanation } = f.compute(memory, ctx);
    factors.push({ name: f.name, value, weight: f.weight, explanation });
    score += value * f.weight;
  }

  const final = clamp01(score);
  const summary = buildSummary(factors, final);

  return {
    memoryId: memory.id,
    importance: final,
    explanation: {
      score: final,
      previousScore: memory.importance ?? null,
      factors,
      summary,
    },
  };
}

function buildSummary(factors: ImportanceFactor[], score: number): string {
  const dominant = factors
    .slice()
    .sort((a, b) => b.value * b.weight - a.value * a.weight)[0];
  if (dominant && dominant.value * dominant.weight > 0.1) {
    return `Importance ${score.toFixed(2)} — strongest factor: ${dominant.name} (${dominant.explanation})`;
  }
  return `Importance ${score.toFixed(2)} — no dominant factor.`;
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

async function assertAccess(userId: string, workspaceId: string): Promise<void> {
  if (!(await userHasWorkspaceAccess(userId, workspaceId))) {
    throw new Error("FORBIDDEN");
  }
}

interface LoadedMemory {
  view: MemoryView;
  entityCount: number;
  relationshipCount: number;
  projectReferenced: boolean;
}

async function loadScorableMemories(
  userId: string,
  workspaceId: string,
  limit: number,
): Promise<LoadedMemory[]> {
  const rows = await queryTenant<Record<string, unknown>>(
    userId,
    `SELECT ${MEMORY_SELECT},
            (SELECT COUNT(*) FROM memory_entities e WHERE e.memory_id = m.id)::int AS "entityCount",
            (SELECT COUNT(*) FROM memory_relationships r
              WHERE r.source_memory_id = m.id OR r.target_memory_id = m.id)::int AS "relationshipCount",
            EXISTS (
              SELECT 1 FROM memory_entities e
              WHERE e.memory_id = m.id AND e.entity_type = 'project'
            ) AS "projectReferenced"
       FROM memory_records m
      WHERE m.workspace_id = $1 AND m.state = 'active'
      ORDER BY m.created_at ASC
      LIMIT $2`,
    [workspaceId, limit],
  );

  return rows.map((r) => ({
    view: mapMemoryRow({ ...r, importance: Number(r.importance ?? 0) }),
    entityCount: Number(r.entityCount ?? 0),
    relationshipCount: Number(r.relationshipCount ?? 0),
    projectReferenced: Boolean(r.projectReferenced),
  }));
}

export interface ComputeImportanceResult {
  scored: number;
  updated: number;
}

/**
 * Score active memories and persist new importance values (only when the score
 * changes by >= CHURN_THRESHOLD). Idempotent. Never deletes.
 */
export async function computeAndStoreImportance(
  userId: string,
  workspaceId: string,
  opts: { limit?: number } = {},
): Promise<ComputeImportanceResult> {
  await assertAccess(userId, workspaceId);
  const limit = Math.max(1, Math.min(opts.limit ?? DEFAULT_BATCH_LIMIT, MAX_BATCH_LIMIT));
  const memories = await loadScorableMemories(userId, workspaceId, limit);

  let updated = 0;
  for (const { view, entityCount, relationshipCount, projectReferenced } of memories) {
    const decision = scoreImportance({
      id: view.id,
      memoryType: view.memoryType,
      importance: view.importance,
      metadata: view.metadata,
      createdAt: view.createdAt,
      occurredAt: view.validFrom,
      entityCount,
      relationshipCount,
      projectReferenced,
    });

    const delta = Math.abs(decision.importance - view.importance);
    if (delta < CHURN_THRESHOLD) continue;

    const newMeta = {
      ...(view.metadata as Record<string, unknown>),
      intelligence: {
        ...((view.metadata?.intelligence as Record<string, unknown>) ?? {}),
        lastImportance: decision.explanation,
      },
    };

    await queryTenant(
      userId,
      `UPDATE memory_records
          SET importance = $3, metadata = $4
        WHERE id = $1 AND workspace_id = $2`,
      [view.id, workspaceId, decision.importance, JSON.stringify(newMeta)],
    );
    updated += 1;
  }

  return { scored: memories.length, updated };
}

/** Toggle a user marker under metadata.intelligence. */
export async function markMemory(
  userId: string,
  workspaceId: string,
  input: MarkMemoryInput,
): Promise<MemoryView | null> {
  await assertAccess(userId, workspaceId);
  const key = MARKER_KEYS[input.marker];
  if (!key) throw new Error(`UNKNOWN_MARKER: ${input.marker}`);

  const rows = await queryTenant<Record<string, unknown>>(
    userId,
    `UPDATE memory_records
        SET metadata = jsonb_set(
              COALESCE(metadata, '{}'::jsonb),
              '{intelligence}',
              (COALESCE(metadata->'intelligence', '{}'::jsonb) ||
               jsonb_build_object($3, $4))
            )
      WHERE id = $1 AND workspace_id = $2
      RETURNING ${MEMORY_SELECT}`,
    [input.memoryId, workspaceId, key, input.active],
  );
  return rows[0] ? mapMemoryRow(rows[0]) : null;
}

/** Recompute / re-read the stored importance explanation for a memory. */
export async function getImportanceExplanation(
  userId: string,
  workspaceId: string,
  memoryId: string,
): Promise<ImportanceExplanation | null> {
  await assertAccess(userId, workspaceId);
  const rows = await queryTenant<Record<string, unknown>>(
    userId,
    `SELECT ${MEMORY_SELECT} FROM memory_records WHERE id = $1 AND workspace_id = $2`,
    [memoryId, workspaceId],
  );
  if (!rows[0]) return null;
  const view = mapMemoryRow(rows[0]);
  const stored = (view.metadata?.intelligence as Record<string, unknown>)?.lastImportance;
  if (stored && typeof stored === "object") {
    return stored as unknown as ImportanceExplanation;
  }

  const memo = await loadScorableMemories(userId, workspaceId, MAX_BATCH_LIMIT);
  const found = memo.find((m) => m.view.id === memoryId);
  if (!found) return null;
  const decision = scoreImportance({
    id: found.view.id,
    memoryType: found.view.memoryType,
    importance: found.view.importance,
    metadata: found.view.metadata,
    createdAt: found.view.createdAt,
    occurredAt: found.view.validFrom,
    entityCount: found.entityCount,
    relationshipCount: found.relationshipCount,
    projectReferenced: found.projectReferenced,
  });
  return decision.explanation;
}

/** Return current marker state for a memory. */
export async function getMemoryMarkers(
  userId: string,
  workspaceId: string,
  memoryId: string,
): Promise<Record<string, boolean>> {
  await assertAccess(userId, workspaceId);
  const rows = await queryTenant<Record<string, unknown>>(
    userId,
    `SELECT metadata FROM memory_records WHERE id = $1 AND workspace_id = $2`,
    [memoryId, workspaceId],
  );
  if (!rows[0]) return {};
  const intelligence = (rows[0].metadata as Record<string, unknown>)?.intelligence;
  return (intelligence as Record<string, boolean>) ?? {};
}
