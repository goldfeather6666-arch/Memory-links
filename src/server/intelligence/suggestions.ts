/**
 * MNEMOSYNE Part 4 — opt-in proactive suggestions.
 *
 * Suggestions are generated from real derived records (contradictions,
 * patterns, consolidations, importance) and always carry supporting evidence.
 * Accepting/rejecting/etc. NEVER auto-modifies user memories; it only records
 * the decision. Deriving or editing a memory is the user's explicit action.
 */

import { queryTenant } from "@/db/client";
import { userHasWorkspaceAccess } from "@/server/data/workspaces";
import { SUGGESTION_SELECT, mapSuggestionRow } from "./helpers";
import type { SuggestionRecord, SuggestionStatus, SuggestionType } from "./types";
import { SUGGESTION_STATUSES } from "./types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_LIMIT = 40;
const MAX_LIMIT = 200;

type DecisionAction = "accept" | "reject" | "edit" | "dismiss" | "defer";

const ACTION_TO_STATUS: Record<DecisionAction, SuggestionStatus> = {
  accept: "accepted",
  reject: "rejected",
  edit: "edited",
  dismiss: "dismissed",
  defer: "deferred",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function assertAccess(userId: string, workspaceId: string): Promise<void> {
  if (!(await userHasWorkspaceAccess(userId, workspaceId))) {
    throw new Error("FORBIDDEN");
  }
}

async function insertSuggestion(
  userId: string,
  workspaceId: string,
  suggestionType: SuggestionType,
  title: string,
  body: string,
  evidence: Record<string, unknown>,
  targetMemoryId?: string,
): Promise<void> {
  const existing = await queryTenant<{ id: string }>(
    userId,
    `SELECT id FROM suggestions
      WHERE workspace_id = $1 AND status = 'pending' AND suggestion_type = $2
        AND title = $3
      LIMIT 1`,
    [workspaceId, suggestionType, title],
  );
  if (existing.length > 0) return; // idempotent per pending suggestion

  await queryTenant(
    userId,
    `INSERT INTO suggestions (
        workspace_id, owner_id, suggestion_type, title, body, evidence, status,
        target_memory_id, decided_at
     ) VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, NULL)`,
    [workspaceId, userId, suggestionType, title, body, JSON.stringify(evidence), targetMemoryId ?? null],
  );
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

export interface GenerateSuggestionsResult {
  created: number;
}

interface PendingSuggestionDraft {
  suggestionType: SuggestionType;
  title: string;
  body: string;
  evidence: Record<string, unknown>;
  targetMemoryId?: string;
}

async function collectContradictionSuggestions(
  userId: string,
  workspaceId: string,
): Promise<PendingSuggestionDraft[]> {
  const rows = await queryTenant<Record<string, unknown>>(
    userId,
    `SELECT id, memory_id_a AS "memoryIdA", memory_id_b AS "memoryIdB", category, evidence
       FROM contradictions
      WHERE workspace_id = $1 AND status = 'unresolved'
      ORDER BY created_at DESC
      LIMIT 20`,
    [workspaceId],
  );
  const drafts: PendingSuggestionDraft[] = [];
  for (const r of rows) {
    const category = String(r.category);
    if (category === "temporal") {
      drafts.push({
        suggestionType: "preference_may_be_outdated",
        title: "A preference may have changed",
        body: "Two memories about the same subject describe a change over time. You may want to confirm which is current.",
        evidence: { contradictionId: String(r.id), memoryIdA: String(r.memoryIdA), memoryIdB: String(r.memoryIdB) },
      });
    } else if (category === "genuine") {
      drafts.push({
        suggestionType: "general",
        title: "Conflicting information detected",
        body: "Two memories directly conflict. Review the unresolved conflict to decide which represents reality.",
        evidence: { contradictionId: String(r.id), memoryIdA: String(r.memoryIdA), memoryIdB: String(r.memoryIdB) },
      });
    }
  }
  return drafts;
}

async function collectPatternSuggestions(
  userId: string,
  workspaceId: string,
): Promise<PendingSuggestionDraft[]> {
  const rows = await queryTenant<Record<string, unknown>>(
    userId,
    `SELECT id, pattern_type AS "patternType", description, supporting_memory_ids AS "supportingMemoryIds"
       FROM patterns
      WHERE workspace_id = $1 AND status = 'active'
      ORDER BY created_at DESC
      LIMIT 20`,
    [workspaceId],
  );
  const drafts: PendingSuggestionDraft[] = [];
  for (const r of rows) {
    const type = String(r.patternType);
    if (type === "repeated_workflow" || type === "recurring_problem") {
      drafts.push({
        suggestionType: "repeated_procedure",
        title: "A procedure appears repeatedly",
        body: "Several memories describe a repeated workflow. Consider consolidating them into a canonical procedure.",
        evidence: { patternId: String(r.id), supportingMemoryIds: r.supportingMemoryIds },
      });
    } else if (type === "consistent_preference") {
      drafts.push({
        suggestionType: "preference_may_be_outdated",
        title: "A stable preference was observed",
        body: "Multiple memories affirm a consistent preference. If it changes, the system will flag it.",
        evidence: { patternId: String(r.id), supportingMemoryIds: r.supportingMemoryIds },
      });
    }
  }
  return drafts;
}

async function collectConsolidationSuggestions(
  userId: string,
  workspaceId: string,
): Promise<PendingSuggestionDraft[]> {
  const rows = await queryTenant<Record<string, unknown>>(
    userId,
    `SELECT id, kind, title, summary, supporting_memory_ids AS "supportingMemoryIds"
       FROM consolidations
      WHERE workspace_id = $1 AND status = 'active'
        AND kind IN ('related','project','event')
      ORDER BY created_at DESC
      LIMIT 20`,
    [workspaceId],
  );
  const drafts: PendingSuggestionDraft[] = [];
  for (const r of rows) {
    const kind = String(r.kind);
    const target = kind === "project" ? "same_project_reference" : "related_memories";
    drafts.push({
      suggestionType: target,
      title: kind === "project" ? "Several memories refer to the same project" : "These memories appear related",
      body: String(r.summary),
      evidence: { consolidationId: String(r.id), supportingMemoryIds: r.supportingMemoryIds },
    });
  }
  return drafts;
}

async function collectRetentionSuggestions(
  userId: string,
  workspaceId: string,
): Promise<PendingSuggestionDraft[]> {
  const rows = await queryTenant<Record<string, unknown>>(
    userId,
    `SELECT mr.id AS "memoryId", mr.content
       FROM memory_records mr
      WHERE mr.workspace_id = $1 AND mr.state = 'active'
        AND (mr.metadata->'intelligence'->>'important') IS DISTINCT FROM 'true'
        AND mr.importance >= 0.8
        AND NOT EXISTS (
          SELECT 1 FROM suggestions s
          WHERE s.workspace_id = $1 AND s.target_memory_id = mr.id
            AND s.suggestion_type = 'long_term_retention' AND s.status = 'pending'
        )
      ORDER BY mr.importance DESC
      LIMIT 10`,
    [workspaceId],
  );
  return rows.map((r) => ({
    suggestionType: "long_term_retention" as const,
    title: "This information may deserve long-term retention",
    body: "A high-importance memory was detected. You may want to mark it as long-term.",
    evidence: { memoryId: String(r.memoryId), contentPreview: String(r.content).slice(0, 160) },
    targetMemoryId: String(r.memoryId),
  }));
}

/** Generate suggestions from real records. Idempotent per pending suggestion. */
export async function generateSuggestions(
  userId: string,
  workspaceId: string,
  opts: { limit?: number } = {},
): Promise<GenerateSuggestionsResult> {
  await assertAccess(userId, workspaceId);
  const limit = Math.max(1, Math.min(opts.limit ?? DEFAULT_LIMIT, MAX_LIMIT));

  const drafts = [
    ...(await collectContradictionSuggestions(userId, workspaceId)),
    ...(await collectPatternSuggestions(userId, workspaceId)),
    ...(await collectConsolidationSuggestions(userId, workspaceId)),
    ...(await collectRetentionSuggestions(userId, workspaceId)),
  ].slice(0, limit);

  for (const d of drafts) {
    await insertSuggestion(
      userId,
      workspaceId,
      d.suggestionType,
      d.title,
      d.body,
      d.evidence,
      d.targetMemoryId,
    );
  }

  return { created: drafts.length };
}

// ---------------------------------------------------------------------------
// Reads / decisions
// ---------------------------------------------------------------------------

export interface ListSuggestionsOptions {
  status?: SuggestionStatus;
  limit?: number;
}

export async function listSuggestions(
  userId: string,
  workspaceId: string,
  opts: ListSuggestionsOptions = {},
): Promise<SuggestionRecord[]> {
  await assertAccess(userId, workspaceId);
  const limit = Math.max(1, Math.min(opts.limit ?? 50, MAX_LIMIT));
  const values: unknown[] = [workspaceId];
  let where = "workspace_id = $1";
  if (opts.status && SUGGESTION_STATUSES.includes(opts.status)) {
    values.push(opts.status);
    where += ` AND status = $${values.length}`;
  }
  values.push(limit);
  const rows = await queryTenant<Record<string, unknown>>(
    userId,
    `SELECT ${SUGGESTION_SELECT} FROM suggestions
      WHERE ${where}
      ORDER BY created_at DESC
      LIMIT $${values.length}`,
    values,
  );
  return rows.map(mapSuggestionRow);
}

/**
 * Record a decision on a suggestion. Never modifies user memories. For 'edit',
 * the editedBody (optional) is stored for audit/transparency.
 */
export async function decideSuggestion(
  userId: string,
  workspaceId: string,
  suggestionId: string,
  action: DecisionAction,
  editedBody?: string,
): Promise<SuggestionRecord | null> {
  await assertAccess(userId, workspaceId);
  const status = ACTION_TO_STATUS[action];
  if (!status) throw new Error(`INVALID_ACTION: ${action}`);

  let bodyUpdate = "";
  let bodyValue: unknown = null;
  if (action === "edit" && editedBody) {
    bodyUpdate = ", body = $4";
    bodyValue = editedBody;
  }

  const rows = await queryTenant<Record<string, unknown>>(
    userId,
    `UPDATE suggestions
        SET status = $3, decided_at = now(), updated_at = now() ${bodyUpdate}
      WHERE id = $1 AND workspace_id = $2
      RETURNING ${SUGGESTION_SELECT}`,
    bodyUpdate ? [suggestionId, workspaceId, status, bodyValue] : [suggestionId, workspaceId, status],
  );
  return rows[0] ? mapSuggestionRow(rows[0]) : null;
}
