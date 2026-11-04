/**
 * MNEMOSYNE Part 4 — contradiction detection.
 *
 * Deterministic, rule-based classifier plus tenant-scoped persistence.
 * - classifyContradiction is pure and returns one of the five categories with a
 *   0..1 confidence and structured evidence.
 * - runContradictionDetection loads active memories for a workspace, groups
 *   candidate pairs by shared normalized entity, classifies each pair and
 *   inserts non-duplicate, high-confidence conflicts (idempotent).
 * - listContradictions / resolveContradiction are tenant-checked queries.
 *
 * SECURITY: every DB entry point first verifies workspace access and throws
 * "FORBIDDEN" otherwise. Memory content is treated as untrusted data (only fed
 * into pure text transformers / JSON evidence, never executed).
 */

import { queryTenant } from "@/db/client";
import { userHasWorkspaceAccess } from "@/server/data/workspaces";
import { clamp01, cosineSimilarity, normalizeText, truncate } from "@/server/memory/util";
import { CONTRADICTION_SELECT, mapContradictionRow } from "./helpers";
import {
  CONTRADICTION_STATUSES,
  type ContradictionCategory,
  type ContradictionRecord,
  type ContradictionStatus,
  type ConflictCandidatePair,
  type ConflictOutput,
} from "./types";

// ---------------------------------------------------------------------------
// Pure extractors
// ---------------------------------------------------------------------------

/** Parse "$1,200", "5k", "42", "18%", "4 people", "3 weeks", … */
function parseNumber(raw: string): number {
  return Number(raw.replace(/,/g, ""));
}

/**
 * Detect a single numeric quantity + unit in a statement.
 * Returns null when there are zero or multiple candidate quantities, or when a
 * number appears without an accompanying unit (e.g. a date like "June 1").
 */
export function extractNumericClaim(text: string): { value: number; unit: string } | null {
  const s = String(text ?? "");
  const matches: { value: number; unit: string }[] = [];

  // Currency quantity, e.g. "$5k", "$1,200", "$2.5m"
  const currency = /\$\s*(\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)\s*(k|m|b)?/gi;
  let m: RegExpExecArray | null;
  while ((m = currency.exec(s)) !== null) {
    if (m[1] === undefined) continue;
    let multiplier = 1;
    const suffix = (m[2] || "").toLowerCase();
    if (suffix === "k") multiplier = 1_000;
    else if (suffix === "m") multiplier = 1_000_000;
    else if (suffix === "b") multiplier = 1_000_000_000;
    matches.push({ value: parseNumber(m[1]) * multiplier, unit: "USD" });
  }

  // Percentage, e.g. "18%"
  const percent = /(\d+(?:\.\d+)?)\s*%/gi;
  while ((m = percent.exec(s)) !== null) {
    matches.push({ value: parseNumber(m[1]), unit: "%" });
  }

  // Quantity + count/measure unit, e.g. "4 people", "3 weeks", "5 GB"
  const quantity =
    /(\d+(?:\.\d+)?)\s*(people|persons?|users|members|clients|customers|employees|teams?|items?|products?|times?|days?|weeks?|months?|years?|hours?|minutes?|seconds?|GB|MB|TB|KB|gb|mb|tb|kb|kg|kilograms|lbs?|pounds|miles?|kilometers?|km|meters?|metres?|feet|dollars?|euros?|bucks|emails?|messages?|requests?|tasks?|meetings?|pages?|versions?|seats?|orders?|sales?|points?)/gi;
  while ((m = quantity.exec(s)) !== null) {
    matches.push({ value: parseNumber(m[1]), unit: m[2].toLowerCase() });
  }

  if (matches.length === 1) return matches[0];
  return null;
}

const POSITIVE_TOKENS = [
  "like",
  "love",
  "prefer",
  "enjoy",
  "recommend",
  "approve",
  "good",
  "great",
  "favorite",
  "best",
  "agree",
  "want",
  "yes",
  "support",
  "excited",
  "happy",
  "works well",
  "reliable",
  "comfortable",
];

const NEGATIVE_TOKENS = [
  "dislike",
  "hate",
  "avoid",
  "reject",
  "disapprove",
  "bad",
  "worst",
  "disagree",
  "no",
  "cannot",
  "cant",
  "not like",
  "dont like",
  "do not like",
  "does not work",
  "doesnt work",
  "unreliable",
  "problem",
  "issue",
  "broken",
  "fails",
  "struggle",
  "not",
];

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasBoundaryToken(text: string, token: string): boolean {
  const escaped = escapeRegExp(token);
  return new RegExp(`(^|\\s)${escaped}(\\s|$)`, "i").test(text);
}

/**
 * Polarity for preference/boolean claims. Returns null when no affective verb /
 * adjective is present, "neutral" when both positive and negative signals occur
 * together, otherwise "positive" / "negative".
 */
export function polarity(text: string): "positive" | "negative" | "neutral" | null {
  const s = normalizeText(text);
  const pos = POSITIVE_TOKENS.filter((t) => hasBoundaryToken(s, t)).length;
  const neg = NEGATIVE_TOKENS.filter((t) => hasBoundaryToken(s, t)).length;
  if (pos === 0 && neg === 0) return null;
  if (pos > 0 && neg > 0) return "neutral";
  return pos > 0 ? "positive" : "negative";
}

const CONTEXT_QUALIFIERS = [
  "at work",
  "for work",
  "at home",
  "for home",
  "on weekends",
  "weekdays",
  "during work",
  "professionally",
  "personally",
  "sometimes",
  "usually",
  "most of the time",
  "when working",
  "when relaxing",
  "in meetings",
  "outside work",
  "remote",
  "onsite",
  "casual",
  "formal",
];

function hasContextQualifier(text: string): boolean {
  const s = normalizeText(text);
  return CONTEXT_QUALIFIERS.some((q) => s.includes(q));
}

function toEpochMs(value: string | null): number | null {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : t;
}

// ---------------------------------------------------------------------------
// Classifier
// ---------------------------------------------------------------------------

/** Internal superset of ConflictCandidatePair carrying available extras. */
interface ExtendedSide {
  id: string;
  content: string;
  occurredAt: string | null;
  createdAt: string;
  summary?: string | null;
  confidence?: number | null;
  embedding?: number[] | null;
}

interface ExtendedCandidatePair extends ConflictCandidatePair {
  a: ExtendedSide;
  b: ExtendedSide;
}

const INSERT_CONFIDENCE_THRESHOLD = 0.7;

/**
 * Deterministic classifier. Returns one of the five categories with a 0..1
 * confidence and evidence {sharedEntity, aContent, bContent, signals}. Never
 * auto-chooses the newest statement; a newer statement is only reflected as a
 * change-over-time ("temporal") signal when both dates are present.
 */
export function classifyContradiction(pair: ConflictCandidatePair): ConflictOutput {
  const p = pair as ExtendedCandidatePair;
  const { a, b, sharedEntity } = p;

  const normA = normalizeText(a.content);
  const normB = normalizeText(b.content);
  const summaryA = a.summary ? normalizeText(a.summary) : "";
  const summaryB = b.summary ? normalizeText(b.summary) : "";
  const hasEmbed =
    Array.isArray(a.embedding) && Array.isArray(b.embedding) && a.embedding.length > 0 && b.embedding.length > 0;
  const sim = hasEmbed ? cosineSimilarity(a.embedding as number[], b.embedding as number[]) : 0;

  const evidence: {
    sharedEntity: string;
    aContent: string;
    bContent: string;
    signals: { categories: string[]; reasons: string[] };
    wasChange?: boolean;
  } = {
    sharedEntity,
    aContent: truncate(a.content, 200),
    bContent: truncate(b.content, 200),
    signals: { categories: [], reasons: [] },
  };
  const mark = (category: string, reason: string) => {
    evidence.signals.categories.push(category);
    evidence.signals.reasons.push(reason);
  };

  const emit = (category: ContradictionCategory, confidence: number): ConflictOutput => ({
    memoryIdA: a.id,
    memoryIdB: b.id,
    category,
    evidence,
    confidence: clamp01(confidence),
  });

  // --- duplicate ------------------------------------------------------------
  if (normA !== "" && normA === normB) {
    mark("duplicate", "identical normalized text");
    return emit("duplicate", 0.99);
  }
  if (summaryA !== "" && summaryA === summaryB) {
    mark("duplicate", "identical summary");
    return emit("duplicate", 0.97);
  }
  if (sim > 0.97) {
    mark("duplicate", `very high cosine similarity (${sim.toFixed(3)})`);
    return emit("duplicate", 0.95);
  }

  const numA = extractNumericClaim(a.content);
  const numB = extractNumericClaim(b.content);
  const polA = polarity(a.content);
  const polB = polarity(b.content);
  const dateA = toEpochMs(a.occurredAt);
  const dateB = toEpochMs(b.occurredAt);
  const hasBothDates = dateA !== null && dateB !== null;
  const numericDiffers = numA !== null && numB !== null && numA.value !== numB.value;
  const preferenceFlip = polA !== null && polB !== null && polA !== "neutral" && polB !== "neutral" && polA !== polB;

  // --- context --------------------------------------------------------------
  const ctxA = hasContextQualifier(a.content);
  const ctxB = hasContextQualifier(b.content);
  if (ctxA || ctxB) {
    mark(
      "context",
      ctxA && ctxB ? "both statements carry qualifying (non-exclusive) contexts" : "statement carries a qualifying context",
    );
    return emit("context", 0.72);
  }

  // --- temporal (change over time) ------------------------------------------
  // Only when both event dates are present (non-invented). A differing numeric
  // quantity is a strong change signal; a preference flip counts only when the
  // statements are materially separated in time.
  const farApart = dateA !== null && dateB !== null && Math.abs(dateA - dateB) > 12 * 3600 * 1000;
  if (hasBothDates && (numericDiffers || (preferenceFlip && farApart))) {
    mark("temporal", "statements record a change over time; newer statement supersedes older");
    evidence.wasChange = true;
    return emit("temporal", 0.85);
  }

  // --- uncertain ------------------------------------------------------------
  const confA = a.confidence ?? 1;
  const confB = b.confidence ?? 1;
  if (confA < 0.5 || confB < 0.5) {
    mark("uncertain", `low memory confidence (${confA.toFixed(2)}, ${confB.toFixed(2)})`);
    return emit("uncertain", 0.4);
  }
  if (!preferenceFlip && !numericDiffers) {
    mark("uncertain", "insufficient evidence of a direct conflict");
    return emit("uncertain", 0.35);
  }

  // --- genuine --------------------------------------------------------------
  mark("genuine", preferenceFlip ? "opposite preferences/views on the same subject" : "conflicting numeric quantities");
  return emit("genuine", 0.9);
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

function canonPair(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export interface RunContradictionOptions {
  limit?: number;
}

/**
 * Load active memories in the workspace, group candidate pairs by shared
 * normalized entity, classify each pair and insert non-duplicate, high-
 * confidence conflicts. Idempotent: pairs already present are skipped.
 */
export async function runContradictionDetection(
  userId: string,
  workspaceId: string,
  opts: RunContradictionOptions = {},
): Promise<{ candidatesExamined: number; contradictionsCreated: number }> {
  if (!(await userHasWorkspaceAccess(userId, workspaceId))) {
    throw new Error("FORBIDDEN");
  }
  const limit = Math.max(1, Math.min(opts.limit ?? 300, 1000));

  // Load active memories (content + temporal + summary + confidence + embedding).
  const memRows = await queryTenant<Record<string, unknown>>(
    userId,
    `SELECT id, content, COALESCE(summary, '') AS summary,
            occurred_at AS "occurredAt", created_at AS "createdAt",
            COALESCE(confidence, 0) AS confidence,
            embedding::float8[] AS embedding
       FROM memory_records
      WHERE workspace_id = $1 AND state = 'active'
      ORDER BY created_at DESC
      LIMIT $2`,
    [workspaceId, limit],
  );

  const memories = new Map<string, ExtendedSide>();
  for (const r of memRows) {
    memories.set(String(r.id), {
      id: String(r.id),
      content: String(r.content),
      occurredAt: r.occurredAt ? String(r.occurredAt) : null,
      createdAt: String(r.createdAt),
      summary: r.summary ? String(r.summary) : null,
      confidence: typeof r.confidence === "number" ? r.confidence : null,
      embedding: Array.isArray(r.embedding) ? (r.embedding as unknown as number[]) : null,
    });
  }

  // Group memory ids by shared normalized entity (lowercased entity_value).
  const entityRows = await queryTenant<{ memoryId: string; value: string }>(
    userId,
    `SELECT me.memory_id AS "memoryId", lower(me.entity_value) AS value
       FROM memory_entities me
       JOIN memory_records mr ON mr.id = me.memory_id
      WHERE mr.workspace_id = $1 AND mr.state = 'active'`,
    [workspaceId],
  );
  const groups = new Map<string, string[]>();
  for (const e of entityRows) {
    const mid = e.memoryId;
    if (!memories.has(mid)) continue;
    const list = groups.get(e.value) ?? [];
    if (!list.includes(mid)) list.push(mid);
    groups.set(e.value, list);
  }

  // Build candidate pairs (a<>b), deduped across entities.
  const pairs: { a: ExtendedSide; b: ExtendedSide; sharedEntity: string }[] = [];
  const pairSeen = new Set<string>();
  for (const [entity, ids] of groups) {
    if (ids.length < 2) continue;
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = memories.get(ids[i]) as ExtendedSide;
        const b = memories.get(ids[j]) as ExtendedSide;
        const key = canonPair(a.id, b.id);
        if (pairSeen.has(key)) continue;
        pairSeen.add(key);
        pairs.push({ a, b, sharedEntity: entity });
      }
    }
  }

  // Idempotency: collect existing pairs across the candidate memory set.
  const memoryIds = Array.from(memories.keys());
  const existing = new Set<string>();
  if (memoryIds.length > 0) {
    const exRows = await queryTenant<{ m: string; n: string }>(
      userId,
      `SELECT memory_id_a AS m, memory_id_b AS n
         FROM contradictions
        WHERE workspace_id = $1 AND (memory_id_a = ANY($2) OR memory_id_b = ANY($2))`,
      [workspaceId, memoryIds],
    );
    for (const r of exRows) {
      existing.add(canonPair(r.m, r.n));
    }
  }

  // Bound the work to keep resource use predictable on large workspaces.
  const maxCandidates = 5000;
  const examined = Math.min(pairs.length, maxCandidates);
  let created = 0;

  for (let k = 0; k < examined; k++) {
    const { a, b, sharedEntity } = pairs[k];
    const key = canonPair(a.id, b.id);
    if (existing.has(key)) continue;

    const result = classifyContradiction({ a, b, sharedEntity });
    if (result.category === "duplicate") continue;
    if (result.confidence < INSERT_CONFIDENCE_THRESHOLD) continue;

    await queryTenant(
      userId,
      `INSERT INTO contradictions (
          workspace_id, owner_id, memory_id_a, memory_id_b, category, evidence,
          confidence, status
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'unresolved')`,
      [workspaceId, userId, a.id, b.id, result.category, JSON.stringify(result.evidence), result.confidence],
    );
    existing.add(key);
    created++;
  }

  return { candidatesExamined: examined, contradictionsCreated: created };
}

export interface ListContradictionsOptions {
  onlyUnresolved?: boolean;
  limit?: number;
}

/** Ordered by created_at DESC. */
export async function listContradictions(
  userId: string,
  workspaceId: string,
  opts: ListContradictionsOptions = {},
): Promise<ContradictionRecord[]> {
  if (!(await userHasWorkspaceAccess(userId, workspaceId))) {
    throw new Error("FORBIDDEN");
  }
  const limit = Math.max(1, Math.min(opts.limit ?? 100, 500));
  const where = [`workspace_id = $1`];
  const values: unknown[] = [workspaceId];
  if (opts.onlyUnresolved) {
    values.push("unresolved");
    where.push(`status = $${values.length}`);
  }

  const rows = await queryTenant<Record<string, unknown>>(
    userId,
    `SELECT ${CONTRADICTION_SELECT} FROM contradictions
      WHERE ${where.join(" AND ")}
      ORDER BY created_at DESC
      LIMIT $${values.length + 1}`,
    [...values, limit],
  );
  return rows.map(mapContradictionRow);
}

/**
 * Explicit user resolution. A newer statement is never auto-chosen; only the
 * status (and resolution_metadata) change.
 */
export async function resolveContradiction(
  userId: string,
  workspaceId: string,
  id: string,
  status: ContradictionStatus,
  note?: string,
): Promise<ContradictionRecord | null> {
  if (!CONTRADICTION_STATUSES.includes(status)) {
    throw new Error(`INVALID_STATUS: ${status}`);
  }
  if (!(await userHasWorkspaceAccess(userId, workspaceId))) {
    throw new Error("FORBIDDEN");
  }

  const resolutionMetadata = {
    resolvedBy: "user",
    note: note ?? null,
    resolvedAt: new Date().toISOString(),
  };
  const rows = await queryTenant<Record<string, unknown>>(
    userId,
    `UPDATE contradictions
        SET status = $2, resolution_metadata = $3, updated_at = now()
      WHERE id = $1 AND workspace_id = $4
      RETURNING ${CONTRADICTION_SELECT}`,
    [id, status, JSON.stringify(resolutionMetadata), workspaceId],
  );
  return rows[0] ? mapContradictionRow(rows[0]) : null;
}
