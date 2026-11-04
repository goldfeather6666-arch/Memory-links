/**
 * MNEMOSYNE Part 4 — evidence-based pattern recognition.
 *
 * Patterns are *observations* derived from multiple supporting memories. They
 * are never asserted as verified facts, and they never infer sensitive personal
 * attributes or psychological diagnoses. Every pattern requires at least
 * `minObservations` (default 3) relevant observations.
 *
 * Surface area:
 *   - detectPatterns(memories, opts)  — pure, deterministic detection.
 *   - runPatternDetection(...)         — load active memories, detect, upsert.
 *   - listPatterns(...)                — newest first, tenant-checked.
 *   - dismissPattern(...)              — tenant-checked status change.
 */

import { queryTenant } from "@/db/client";
import type { MemoryType } from "@/db/schema";
import { userHasWorkspaceAccess } from "@/server/data/workspaces";
import { clamp01, normalizeText } from "@/server/memory/util";
import { PATTERN_SELECT, mapPatternRow } from "./helpers";
import type { PatternOutput, PatternRecord, PatternType } from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PatternMemoryInput {
  id: string;
  content: string;
  summary: string | null;
  memoryType: MemoryType;
  occurredAt: string | null;
  createdAt: string;
  entities: Array<{ type?: string; value: string; confidence?: number }>;
}

export interface DetectOptions {
  /** Minimum number of supporting observations required (default 3). */
  minObservations?: number;
}

// ---------------------------------------------------------------------------
// Constants / heuristics
// ---------------------------------------------------------------------------

const DEFAULT_MIN_OBSERVATIONS = 3;

const PROBLEM_WORD_RE = /\b(issue|bug|error|failed|broken|problem)\b/i;

const PREFERENCE_POSITIVE_RE =
  /\bI\s+(?:strongly\s+|really\s+|definitely\s+)?(?:prefer|love|like|enjoy)\b/i;
const PREFERENCE_NEGATIVE_RE =
  /\bI\s+(?:do\s+not|don'?t|never)\s+(?:strongly\s+|really\s+|definitely\s+)?(?:prefer|love|like|enjoy)\b/i;
const DISLIKE_RE = /\bI\s+dislike\b/i;

const DECISION_RE = /\b(?:decided|chose|selected|choosing|deciding)\b/i;

/** Minimum token-set Dice similarity for two memories to join a workflow cluster. */
const WORKFLOW_SIMILARITY_THRESHOLD = 0.72;

/** Upper bound for confidence so patterns are never presented as certain. */
const MAX_CONFIDENCE = 0.92;

// ---------------------------------------------------------------------------
// Small pure helpers
// ---------------------------------------------------------------------------

/** Calendar date key (yyyy-mm-dd) used to count "distinct time points". */
function dateKey(iso: string): string {
  return iso.slice(0, 10);
}

function distinctDates(memories: PatternMemoryInput[]): number {
  return new Set(memories.map((m) => dateKey(m.occurredAt ?? m.createdAt))).size;
}

/** Canonical, de-duplicated entity names for a memory. */
function canonicalEntities(m: PatternMemoryInput): string[] {
  const out = new Set<string>();
  for (const e of m.entities ?? []) {
    if (!e || !e.value) continue;
    const name = normalizeText(String(e.value));
    if (name) out.add(name);
  }
  return Array.from(out);
}

/** Token-set Dice coefficient; a cheap, deterministic normalized similarity. */
function textSimilarity(a: string, b: string): number {
  const A = normalizeText(a).split(/\s+/);
  const B = normalizeText(b).split(/\s+/);
  if (A.length === 0 || B.length === 0) return 0;
  const setB = new Set(B);
  let inter = 0;
  for (const t of A) if (setB.has(t)) inter++;
  return (2 * inter) / (A.length + B.length);
}

/** Text tail after a match end offset, cut at clause boundaries. */
function tailAfterStart(content: string, start: number): string {
  const remainder = content.slice(start);
  const segment = remainder.split(/[,.;!?]|\b(?:and|but|because)\b/i)[0] ?? "";
  return normalizeText(segment.replace(/^(?:to|that|on|about|of|for|with)\s+/, ""));
}

function pushGroup(map: Map<string, PatternMemoryInput[]>, key: string, m: PatternMemoryInput): void {
  const list = map.get(key) ?? [];
  list.push(m);
  map.set(key, list);
}

/**
 * Confidence from observation count and temporal spread. Base weight grows
 * with count; spread (distinct dates) adds evidence that the pattern is
 * recurrent rather than a one-off cluster.
 */
function confidenceFrom(count: number, distinct: number, minObs: number): number {
  const countFactor = Math.min(1, (count - minObs + 1) / (minObs + 2));
  const spreadFactor = Math.min(1, distinct / Math.max(minObs, count));
  const raw = Math.min(MAX_CONFIDENCE, 0.45 + 0.35 * countFactor + 0.2 * spreadFactor);
  return clamp01(Math.round(raw * 10000) / 10000);
}

function makeOutput(
  patternType: PatternType,
  memoryIds: string[],
  description: string,
  confidence: number,
): PatternOutput {
  return { patternType, description, memoryIds, confidence };
}

// ---------------------------------------------------------------------------
// Pattern detectors
// ---------------------------------------------------------------------------

function detectFrequentProjects(
  memories: PatternMemoryInput[],
  minObs: number,
): PatternOutput[] {
  const groups = new Map<string, PatternMemoryInput[]>();
  for (const m of memories) {
    for (const e of m.entities ?? []) {
      if ((e.type ?? "").toLowerCase() !== "project") continue;
      const name = normalizeText(String(e.value));
      if (!name) continue;
      pushGroup(groups, name, m);
    }
  }

  const out: PatternOutput[] = [];
  for (const [name, group] of groups) {
    if (group.length < minObs) continue;
    const distinct = distinctDates(group);
    if (distinct < 2) continue;
    out.push(
      makeOutput(
        "frequent_project",
        group.map((m) => m.id),
        `Multiple memories reference the project "${name}" (${group.length} observations across ${distinct} distinct dates). This suggests the user frequently engages with this project.`,
        confidenceFrom(group.length, distinct, minObs),
      ),
    );
  }
  return out;
}

function detectRepeatedWorkflows(
  memories: PatternMemoryInput[],
  minObs: number,
): PatternOutput[] {
  const procedural = memories.filter((m) => m.memoryType === "procedural");
  const clusters: PatternMemoryInput[][] = [];
  for (const m of procedural) {
    let placed = false;
    for (const cluster of clusters) {
      if (textSimilarity(cluster[0].content, m.content) >= WORKFLOW_SIMILARITY_THRESHOLD) {
        cluster.push(m);
        placed = true;
        break;
      }
    }
    if (!placed) clusters.push([m]);
  }

  const out: PatternOutput[] = [];
  for (const cluster of clusters) {
    if (cluster.length < minObs) continue;
    const distinct = distinctDates(cluster);
    out.push(
      makeOutput(
        "repeated_workflow",
        cluster.map((m) => m.id),
        `${cluster.length} memories describe a similar procedural workflow (across ${distinct} distinct dates). This suggests the user repeats a comparable set of steps.`,
        confidenceFrom(cluster.length, distinct, minObs),
      ),
    );
  }
  return out;
}

function detectRecurringProblems(
  memories: PatternMemoryInput[],
  minObs: number,
): PatternOutput[] {
  const problemMemories = memories.filter((m) => PROBLEM_WORD_RE.test(m.content));
  const groups = new Map<string, PatternMemoryInput[]>();
  for (const m of problemMemories) {
    for (const name of canonicalEntities(m)) {
      pushGroup(groups, name, m);
    }
  }

  const out: PatternOutput[] = [];
  for (const [entity, group] of groups) {
    if (group.length < minObs) continue;
    const distinct = distinctDates(group);
    out.push(
      makeOutput(
        "recurring_problem",
        group.map((m) => m.id),
        `${group.length} memories describe a problem related to "${entity}" (e.g., issues, bugs, errors) across ${distinct} distinct dates. This suggests the user encounters recurrent difficulties in this area.`,
        confidenceFrom(group.length, distinct, minObs),
      ),
    );
  }
  return out;
}

interface PreferenceInfo {
  target: string;
  polarity: "pos" | "neg";
}

function preferenceInfo(content: string): PreferenceInfo | null {
  const negative = PREFERENCE_NEGATIVE_RE.test(content) || DISLIKE_RE.test(content);
  const positiveMatch = content.match(PREFERENCE_POSITIVE_RE);
  const dislikeMatch = content.match(DISLIKE_RE);
  if (!positiveMatch && !dislikeMatch) return null;

  let target = "";
  if (positiveMatch?.index !== undefined) {
    target = tailAfterStart(content, positiveMatch.index + positiveMatch[0].length);
  } else if (dislikeMatch?.index !== undefined) {
    target = tailAfterStart(content, dislikeMatch.index + dislikeMatch[0].length);
  }
  if (!target) return null;

  return { target, polarity: negative ? "neg" : "pos" };
}

function detectConsistentPreferences(
  memories: PatternMemoryInput[],
  minObs: number,
): PatternOutput[] {
  const groups = new Map<string, PatternMemoryInput[]>();
  for (const m of memories) {
    const info = preferenceInfo(m.content);
    if (!info) continue;
    const key = `${info.target}::${info.polarity}`;
    pushGroup(groups, key, m);
  }

  const out: PatternOutput[] = [];
  for (const [key, group] of groups) {
    if (group.length < minObs) continue;
    const idx = key.lastIndexOf("::");
    const target = key.slice(0, idx);
    const polarity = key.slice(idx + 2);
    if (!target) continue;
    const distinct = distinctDates(group);
    out.push(
      makeOutput(
        "consistent_preference",
        group.map((m) => m.id),
        `${group.length} memories express a consistent ${polarity === "neg" ? "aversion to" : "preference for"} "${target}" across ${distinct} distinct dates. This suggests a stable preference.`,
        confidenceFrom(group.length, distinct, minObs),
      ),
    );
  }
  return out;
}

interface DecisionInfo {
  subject: string;
  side: string;
}

function decisionInfo(m: PatternMemoryInput): DecisionInfo | null {
  const match = m.content.match(DECISION_RE);
  if (!match || match.index === undefined) return null;
  const verbEnd = match.index + match[0].length;
  const ents = canonicalEntities(m);
  const subject = ents[0] ?? "";
  const side = ents[0] ?? tailAfterStart(m.content, verbEnd);
  if (!subject || !side) return null;
  return { subject, side };
}

function detectRepeatedDecisions(
  memories: PatternMemoryInput[],
  minObs: number,
): PatternOutput[] {
  const groups = new Map<string, { memory: PatternMemoryInput; side: string }[]>();
  for (const m of memories) {
    const info = decisionInfo(m);
    if (!info) continue;
    const list = groups.get(info.subject) ?? [];
    list.push({ memory: m, side: info.side });
    groups.set(info.subject, list);
  }

  const out: PatternOutput[] = [];
  for (const [subject, entries] of groups) {
    if (entries.length < minObs) continue;
    const distinct = distinctDates(entries.map((e) => e.memory));
    out.push(
      makeOutput(
        "repeated_decision",
        entries.map((e) => e.memory.id),
        `${entries.length} memories record decisions about "${subject}" across ${distinct} distinct dates. This suggests the user repeatedly decides within this area.`,
        confidenceFrom(entries.length, distinct, minObs),
      ),
    );
  }
  return out;
}

function detectPriorityChanges(memories: PatternMemoryInput[]): PatternOutput[] {
  const groups = new Map<string, { memory: PatternMemoryInput; side: string; date: string }[]>();
  for (const m of memories) {
    const info = decisionInfo(m);
    if (!info) continue;
    const list = groups.get(info.subject) ?? [];
    list.push({ memory: m, side: info.side, date: m.occurredAt ?? m.createdAt });
    groups.set(info.subject, list);
  }

  const out: PatternOutput[] = [];
  for (const [subject, entries] of groups) {
    if (entries.length < 2) continue;
    entries.sort((a, b) => a.date.localeCompare(b.date));
    const sides = new Set(entries.map((e) => e.side));
    if (sides.size < 2) continue;
    const oldSide = entries[0].side;
    const newSide = entries[entries.length - 1].side;
    if (newSide === oldSide) continue;

    const distinct = distinctDates(entries.map((e) => e.memory));
    out.push(
      makeOutput(
        "priority_change",
        entries.map((e) => e.memory.id).sort(),
        `Decisions about "${subject}" have changed over time (e.g., from "${oldSide}" to "${newSide}"). This suggests priorities may have shifted.`,
        Math.max(0.5, confidenceFrom(entries.length, distinct, DEFAULT_MIN_OBSERVATIONS)),
      ),
    );
  }
  return out;
}

// ---------------------------------------------------------------------------
// Public detection
// ---------------------------------------------------------------------------

/**
 * Pure, deterministic detection. Returns zero patterns when there is not
 * enough evidence. Patterns are observations — never verified facts and never
 * personality/psychological inference.
 */
export function detectPatterns(
  memories: PatternMemoryInput[],
  opts: DetectOptions = {},
): PatternOutput[] {
  const minObs = Math.max(2, opts.minObservations ?? DEFAULT_MIN_OBSERVATIONS);
  if (memories.length === 0) return [];

  const outputs: PatternOutput[] = [
    ...detectFrequentProjects(memories, minObs),
    ...detectRepeatedWorkflows(memories, minObs),
    ...detectRecurringProblems(memories, minObs),
    ...detectConsistentPreferences(memories, minObs),
    ...detectRepeatedDecisions(memories, minObs),
    ...detectPriorityChanges(memories),
  ];

  // frequently_referenced: any entity referenced across >=3 distinct dates.
  const entityDates = new Map<string, Set<string>>();
  for (const m of memories) {
    const d = dateKey(m.occurredAt ?? m.createdAt);
    for (const name of canonicalEntities(m)) {
      const set = entityDates.get(name) ?? new Set<string>();
      set.add(d);
      entityDates.set(name, set);
    }
  }
  for (const [entity, dates] of entityDates) {
    if (dates.size < 3) continue;
    const supporting = memories.filter((m) => canonicalEntities(m).includes(entity));
    outputs.push(
      makeOutput(
        "frequently_referenced",
        supporting.map((m) => m.id),
        `The entity "${entity}" is referenced across ${dates.size} distinct dates (${supporting.length} memories). This suggests it is frequently relevant.`,
        Math.max(0.5, confidenceFrom(supporting.length, dates.size, DEFAULT_MIN_OBSERVATIONS)),
      ),
    );
  }

  return dedupeOutputs(outputs);
}

function dedupeOutputs(outputs: PatternOutput[]): PatternOutput[] {
  const seen = new Set<string>();
  const out: PatternOutput[] = [];
  for (const o of outputs) {
    const key = `${o.patternType}::${[...o.memoryIds].sort().join(",")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(o);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

const MEMORY_LOAD_SELECT = `
  SELECT m.id, m.content, m.summary, m.memory_type AS "memoryType",
         m.occurred_at AS "occurredAt", m.created_at AS "createdAt",
         COALESCE(json_agg(
           json_build_object('type', e.entity_type, 'value', e.entity_value, 'confidence', e.confidence)
         ) FILTER (WHERE e.id IS NOT NULL), '[]'::json) AS entities
    FROM memory_records m
    LEFT JOIN memory_entities e ON e.memory_id = m.id
   WHERE m.workspace_id = $1 AND m.state = 'active'
   GROUP BY m.id
   ORDER BY m.created_at DESC
   LIMIT $2
`;

async function loadActiveMemories(
  userId: string,
  workspaceId: string,
  limit: number,
): Promise<PatternMemoryInput[]> {
  const rows = await queryTenant<Record<string, unknown>>(userId, MEMORY_LOAD_SELECT, [
    workspaceId,
    limit,
  ]);
  return rows.map((r) => ({
    id: String(r.id),
    content: String(r.content),
    summary: r.summary ? String(r.summary) : null,
    memoryType: r.memoryType as MemoryType,
    occurredAt: r.occurredAt ? String(r.occurredAt) : null,
    createdAt: String(r.createdAt),
    entities: ((r.entities as Array<{ type?: string; value: string; confidence?: number }>) ?? [])
      .filter((e) => e && e.value)
      .map((e) => ({
        type: e.type ?? undefined,
        value: String(e.value),
        confidence: e.confidence ?? undefined,
      })),
  }));
}

function patternIdentityKey(patternType: string, memoryIds: string[]): string {
  return `${patternType}::${[...memoryIds].sort().join(",")}`;
}

export interface RunPatternDetectionOptions {
  /** Max active memories to scan (default 400, capped at 2000). */
  limit?: number;
}

/**
 * Load active memories, detect patterns, and upsert idempotently. An existing
 * active pattern with the same pattern_type AND the same supporting memory id
 * set is updated (last_observed_at + confidence); otherwise a new row is
 * inserted. Returns counts of created/updated rows.
 */
export async function runPatternDetection(
  userId: string,
  workspaceId: string,
  opts: RunPatternDetectionOptions = {},
): Promise<{ patternsCreated: number; patternsUpdated: number }> {
  if (!(await userHasWorkspaceAccess(userId, workspaceId))) {
    throw new Error("FORBIDDEN");
  }

  const limit = Math.min(Math.max(1, opts.limit ?? 400), 2000);
  const memories = await loadActiveMemories(userId, workspaceId, limit);
  const detected = detectPatterns(memories);

  const existingRows = await queryTenant<Record<string, unknown>>(
    userId,
    `SELECT ${PATTERN_SELECT} FROM patterns WHERE workspace_id = $1 AND status = 'active'`,
    [workspaceId],
  );
  const existing = existingRows.map(mapPatternRow);
  const existingByIdentity = new Map<string, PatternRecord>();
  for (const p of existing) {
    existingByIdentity.set(patternIdentityKey(p.patternType, p.supportingMemoryIds), p);
  }

  const memoryById = new Map(memories.map((m) => [m.id, m]));
  let patternsCreated = 0;
  let patternsUpdated = 0;

  for (const output of detected) {
    // Restrict to memories actually present in the loaded set.
    const ids = output.memoryIds.filter((id) => memoryById.has(id));
    if (ids.length === 0) continue;

    let firstObservedAt: string | null = null;
    let lastObservedAt: string | null = null;
    for (const id of ids) {
      const createdAt = memoryById.get(id)!.createdAt;
      if (firstObservedAt === null || createdAt < firstObservedAt) firstObservedAt = createdAt;
      if (lastObservedAt === null || createdAt > lastObservedAt) lastObservedAt = createdAt;
    }
    if (!firstObservedAt || !lastObservedAt) continue;

    const identityKey = patternIdentityKey(output.patternType, ids);
    const existingPattern = existingByIdentity.get(identityKey);

    if (existingPattern) {
      await queryTenant(
        userId,
        `UPDATE patterns
            SET last_observed_at = GREATEST(last_observed_at, $2::timestamptz),
                confidence = $3,
                updated_at = now()
          WHERE id = $1 AND workspace_id = $4`,
        [existingPattern.id, lastObservedAt, output.confidence, workspaceId],
      );
      patternsUpdated += 1;
    } else {
      await queryTenant(
        userId,
        `INSERT INTO patterns (
            workspace_id, owner_id, pattern_type, description, supporting_memory_ids,
            confidence, first_observed_at, last_observed_at, status
         ) VALUES ($1, $2, $3, $4, $5::uuid[], $6, $7, $8, 'active')`,
        [
          workspaceId,
          userId,
          output.patternType,
          output.description,
          ids,
          output.confidence,
          firstObservedAt,
          lastObservedAt,
        ],
      );
      patternsCreated += 1;
    }
  }

  return { patternsCreated, patternsUpdated };
}

export interface ListPatternsOptions {
  status?: string;
}

/** Newest-first list of patterns for a workspace. Tenant-checked. */
export async function listPatterns(
  userId: string,
  workspaceId: string,
  opts: ListPatternsOptions = {},
): Promise<PatternRecord[]> {
  if (!(await userHasWorkspaceAccess(userId, workspaceId))) {
    throw new Error("FORBIDDEN");
  }

  const rows = await queryTenant<Record<string, unknown>>(
    userId,
    `SELECT ${PATTERN_SELECT}
       FROM patterns
      WHERE workspace_id = $1
        AND ($2::text IS NULL OR status = $2)
      ORDER BY created_at DESC`,
    [workspaceId, opts.status ?? null],
  );
  return rows.map(mapPatternRow);
}

/** Tenant-checked dismissal of a pattern (active -> dismissed). */
export async function dismissPattern(
  userId: string,
  workspaceId: string,
  id: string,
): Promise<boolean> {
  if (!(await userHasWorkspaceAccess(userId, workspaceId))) {
    throw new Error("FORBIDDEN");
  }

  const rows = await queryTenant(
    userId,
    `UPDATE patterns
        SET status = 'dismissed', updated_at = now()
      WHERE id = $1 AND workspace_id = $2
      RETURNING id`,
    [id, workspaceId],
  );
  return rows.length > 0;
}
