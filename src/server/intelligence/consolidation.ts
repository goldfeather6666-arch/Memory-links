/**
 * MNEMOSYNE Part 4 — incremental memory consolidation.
 *
 * Clusters a bounded batch of memories into deterministic consolidation groups
 * and persists them as `consolidations` rows. Consolidations are *descriptive*
 * observations (soft summaries) — they are never treated as verified facts, and
 * source memories are never deleted, edited, or replaced.
 *
 * Incremental model: the per-workspace low-water mark is the latest consolidation
 * `created_at` (getLastConsolidationAt). Each run loads only memories updated
 * *after* that mark (plus a small recent-overlap window that shares entities with
 * the new batch), so already-processed history is not reprocessed on every run.
 *
 * Grouping is purely deterministic (no LLM calls): text reuse is detected via
 * character-bigram cosine similarity; entity reuse comes from memory_entities.
 * `gap` / `contradiction` / `summary` kinds are intentionally NOT auto-generated
 * here (gaps are never invented, contradictions/summaries are separate concerns).
 */

import { queryTenant } from "@/db/client";
import { userHasWorkspaceAccess } from "@/server/data/workspaces";
import { clamp01, cosineSimilarity, normalizeText, truncate } from "@/server/memory/util";
import { CONSOLIDATION_SELECT, mapConsolidationRow } from "./helpers";
import type {
  ConsolidationGroup,
  ConsolidationKind,
  ConsolidationRecord,
  MemoryType,
} from "./types";

// ---------------------------------------------------------------------------
// Public input shapes
// ---------------------------------------------------------------------------

export interface ConsolidationMemoryEntity {
  type?: string;
  value: string;
  confidence?: number;
}

/** Shape of a memory fed to the pure grouping builder. */
export interface ConsolidationMemoryInput {
  id: string;
  content: string;
  summary: string | null;
  memoryType: MemoryType;
  occurredAt: string | null;
  createdAt: string;
  importance: number;
  entities?: ConsolidationMemoryEntity[];
  /** Optional, used only to populate source_refs on the persisted row. */
  sourceRef?: string | null;
}

export interface BuildConsolidationOptions {
  /** Minimum number of supporting memories for a group (default 2). */
  minSupport?: number;
}

export interface RunConsolidationOptions {
  /** Max memories to load per run. */
  limit?: number;
  /** If set, only create groups of this kind (non-generated kinds yield 0). */
  kind?: ConsolidationKind;
}

export interface ListConsolidationOptions {
  kind?: ConsolidationKind;
  limit?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_MIN_SUPPORT = 2;
const DEFAULT_BATCH_LIMIT = 250;
const OVERLAP_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h
const REPEATED_SIMILARITY = 0.85;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_BATCH_LIMIT = 1000;
const MAX_LIST_LIMIT = 200;

const DECISION_VERBS =
  /\b(decided|chose|selected|moved to|switched to|agreed|opted for|chosen|switching to)\b/i;

const PREFERENCE_LEXICON =
  /\b(prefer|preferred|like|likes|love|loves|enjoy|enjoys|favorite|favourite|dislike|would rather|always use|tend to|better than|rather than)\b/i;

// ---------------------------------------------------------------------------
// Text / entity helpers (pure)
// ---------------------------------------------------------------------------

type Vector = Map<string, number>;

function textVector(input: string): Vector {
  const norm = normalizeText(input ?? "");
  const vec = new Map<string, number>();
  if (norm.length === 0) return vec;
  if (norm.length === 1) {
    vec.set(norm, 1);
    return vec;
  }
  for (let i = 0; i < norm.length - 1; i++) {
    const g = norm.slice(i, i + 2);
    vec.set(g, (vec.get(g) ?? 0) + 1);
  }
  let sumSquares = 0;
  for (const v of vec.values()) sumSquares += v * v;
  const len = Math.sqrt(sumSquares);
  if (len === 0) return vec;
  for (const k of [...vec.keys()]) vec.set(k, (vec.get(k) as number) / len);
  return vec;
}

function vectorArray(vec: Vector, keys: string[]): number[] {
  return keys.map((k) => vec.get(k) ?? 0);
}

function textSimilarity(a: Vector, b: Vector): number {
  const keys = Array.from(new Set<string>([...a.keys(), ...b.keys()]));
  return cosineSimilarity(vectorArray(a, keys), vectorArray(b, keys));
}

interface MemEnt {
  type: string;
  value: string;
}

function entityKey(e: MemEnt): string {
  return normalizeText(e.value ?? "");
}

function uniqueEntities(list: MemEnt[]): MemEnt[] {
  const seen = new Set<string>();
  const out: MemEnt[] = [];
  for (const e of list) {
    const k = entityKey(e);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push({ type: e.type, value: k });
  }
  return out;
}

function sortedKeys(map: Map<string, unknown>): string[] {
  return Array.from(map.keys()).sort();
}

function parseDate(iso: string | null): number {
  if (!iso) return NaN;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? NaN : t;
}

// ---------------------------------------------------------------------------
// Group construction helpers
// ---------------------------------------------------------------------------

interface IndexedMemory {
  m: ConsolidationMemoryInput;
  idx: number;
  vec: Vector;
  ents: MemEnt[];
}

function indexMemories(memories: ConsolidationMemoryInput[]): IndexedMemory[] {
  return memories.map((m, i) => ({
    m,
    idx: i,
    vec: textVector(m.content),
    ents: uniqueEntities(
      (m.entities ?? []).map((e) => ({
        type: (e.type ?? "").toLowerCase(),
        value: String(e.value ?? ""),
      })),
    ),
  }));
}

function freshEntityIndex(idx: IndexedMemory[], assigned: Set<number>): Map<string, number[]> {
  const map = new Map<string, number[]>();
  for (const im of idx) {
    if (assigned.has(im.idx)) continue;
    for (const e of im.ents) {
      const k = entityKey(e);
      if (!k) continue;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(im.idx);
    }
  }
  return map;
}

function sampleContent(mems: ConsolidationMemoryInput[]): string {
  const shortest = mems.slice().sort((a, b) => a.content.length - b.content.length)[0];
  return truncate(shortest.content.trim(), 120);
}

function dateLabel(mems: ConsolidationMemoryInput[]): string {
  const d = parseDate(mems[0].occurredAt);
  if (Number.isNaN(d)) return "the same period";
  return new Date(d).toISOString().slice(0, 10);
}

function makeTitle(
  kind: ConsolidationKind,
  _mems: ConsolidationMemoryInput[],
  entity: string | undefined,
): string {
  switch (kind) {
    case "repeated_fact":
      return "Repeated fact";
    case "repeated_preference":
      return "Repeated preference";
    case "project":
      return `Project: ${entity}`;
    case "event":
      return `Event: ${entity}`;
    case "decision":
      return `Decision: ${entity}`;
    case "change":
      return `Change: ${entity}`;
    case "related":
    default:
      return `Related memories: ${entity ?? "shared topic"}`;
  }
}

function makeSummary(
  kind: ConsolidationKind,
  mems: ConsolidationMemoryInput[],
  entity: string | undefined,
): string {
  const n = mems.length;
  const sample = sampleContent(mems);
  switch (kind) {
    case "repeated_fact":
      return `${n} memories restate the same fact (e.g., "${sample}").`;
    case "repeated_preference":
      return `${n} memories express the same preference (e.g., "${sample}").`;
    case "project":
      return `Across ${n} memories, the project "${entity}" is referenced.`;
    case "event":
      return `${n} memories describe activity involving "${entity}" around ${dateLabel(mems)}.`;
    case "decision":
      return `Several memories record decisions involving "${entity}".`;
    case "change":
      return `A newer memory supersedes an earlier statement about "${entity}".`;
    case "related":
    default:
      return `${n} memories are related by a shared reference to "${entity}".`;
  }
}

function groupConfidence(mems: ConsolidationMemoryInput[], minSupport: number): number {
  const n = Math.max(1, mems.length);
  const avg = mems.reduce((sum, m) => sum + clamp01(Number(m.importance) || 0), 0) / n;
  const supportFactor = Math.min(1, (mems.length - minSupport + 1) / 3);
  return clamp01(0.8 * avg + 0.2 * supportFactor);
}

function makeGroup(
  kind: ConsolidationKind,
  entity: string | undefined,
  memberIdx: number[],
  idx: IndexedMemory[],
  minSupport: number,
  extraMeta: Record<string, unknown>,
): ConsolidationGroup {
  const mems = memberIdx.map((i) => idx[i].m);
  const memoryIds = mems.map((m) => m.id);
  const meta: Record<string, unknown> = { support: memoryIds.length };
  if (entity) meta.sharedEntity = entity;
  Object.assign(meta, extraMeta);
  return {
    kind,
    title: makeTitle(kind, mems, entity),
    summary: makeSummary(kind, mems, entity),
    memoryIds,
    confidence: groupConfidence(mems, minSupport),
    meta,
  };
}

// ---------------------------------------------------------------------------
// Pure grouping builder
// ---------------------------------------------------------------------------

export function buildConsolidationGroups(
  memories: ConsolidationMemoryInput[],
  opts: BuildConsolidationOptions = {},
): ConsolidationGroup[] {
  const minSupport = Math.max(2, opts.minSupport ?? DEFAULT_MIN_SUPPORT);
  const idx = indexMemories(memories);
  const assigned = new Set<number>();
  const groups: ConsolidationGroup[] = [];

  // ---- change: newer statement supersedes older, same subject, dates present ----
  {
    const entIndex = freshEntityIndex(idx, assigned);
    for (const key of sortedKeys(entIndex)) {
      const members = entIndex
        .get(key)!
        .map((i) => idx[i])
        .filter((im) => !Number.isNaN(parseDate(im.m.occurredAt)));
      if (members.length < minSupport) continue;
      members.sort((a, b) => parseDate(a.m.occurredAt) - parseDate(b.m.occurredAt));
      const distinct = members.some(
        (im, j) => j > 0 && textSimilarity(members[j - 1].vec, im.vec) < REPEATED_SIMILARITY,
      );
      if (!distinct) continue;
      const older = members[0];
      const newer = members[members.length - 1];
      const stuff = members.map((im) => im.idx);
      groups.push(
        makeGroup("change", key, stuff, idx, minSupport, {
          sharedEntity: key,
          olderMemoryId: older.m.id,
          newerMemoryId: newer.m.id,
        }),
      );
      stuff.forEach((i) => assigned.add(i));
    }
  }

  // ---- decision: decision verbs sharing an entity ----
  {
    const entIndex = freshEntityIndex(idx, assigned);
    for (const key of sortedKeys(entIndex)) {
      const members = entIndex
        .get(key)!
        .map((i) => idx[i])
        .filter((im) => DECISION_VERBS.test(im.m.content));
      if (members.length < minSupport) continue;
      const stuff = members.map((im) => im.idx);
      groups.push(makeGroup("decision", key, stuff, idx, minSupport, { sharedEntity: key }));
      stuff.forEach((i) => assigned.add(i));
    }
  }

  // ---- project: same project entity ----
  {
    const entIndex = freshEntityIndex(idx, assigned);
    for (const key of sortedKeys(entIndex)) {
      const members = entIndex
        .get(key)!
        .map((i) => idx[i])
        .filter((im) => im.ents.some((e) => e.type === "project"));
      if (members.length < minSupport) continue;
      const stuff = members.map((im) => im.idx);
      groups.push(makeGroup("project", key, stuff, idx, minSupport, { sharedEntity: key }));
      stuff.forEach((i) => assigned.add(i));
    }
  }

  // ---- event: occurrences within a bounded window sharing an entity ----
  {
    const entIndex = freshEntityIndex(idx, assigned);
    for (const key of sortedKeys(entIndex)) {
      const members = entIndex
        .get(key)!
        .map((i) => idx[i])
        .filter((im) => !Number.isNaN(parseDate(im.m.occurredAt)));
      if (members.length < minSupport) continue;
      members.sort((a, b) => parseDate(a.m.occurredAt) - parseDate(b.m.occurredAt));
      let cluster: IndexedMemory[] = [members[0]];
      const clusters: IndexedMemory[][] = [cluster];
      for (let j = 1; j < members.length; j++) {
        const prev = parseDate(members[j - 1].m.occurredAt);
        const cur = parseDate(members[j].m.occurredAt);
        if (cur - prev <= DAY_MS) {
          cluster.push(members[j]);
        } else {
          cluster = [members[j]];
          clusters.push(cluster);
        }
      }
      for (const cl of clusters) {
        if (cl.length < minSupport) continue;
        const stuff = cl.map((im) => im.idx);
        groups.push(makeGroup("event", key, stuff, idx, minSupport, { sharedEntity: key }));
        stuff.forEach((i) => assigned.add(i));
      }
    }
  }

  // ---- repeated_fact / repeated_preference: normalized-text reuse ----
  {
    const remaining = idx.filter((im) => !assigned.has(im.idx));
    const n = remaining.length;
    if (n >= minSupport) {
      const parent = Array.from({ length: n }, (_, i) => i);
      const rank = new Array<number>(n).fill(0);
      const find = (x: number): number => {
        while (parent[x] !== x) {
          parent[x] = parent[parent[x]];
          x = parent[x];
        }
        return x;
      };
      const union = (a: number, b: number): void => {
        const ra = find(a);
        const rb = find(b);
        if (ra === rb) return;
        if (rank[ra] < rank[rb]) parent[ra] = rb;
        else if (rank[ra] > rank[rb]) parent[rb] = ra;
        else {
          parent[rb] = ra;
          rank[ra]++;
        }
      };
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          if (textSimilarity(remaining[i].vec, remaining[j].vec) > REPEATED_SIMILARITY) {
            union(i, j);
          }
        }
      }
      const comps = new Map<number, number[]>();
      for (let i = 0; i < n; i++) {
        const r = find(i);
        if (!comps.has(r)) comps.set(r, []);
        comps.get(r)!.push(i);
      }
      for (const memberIdxList of comps.values()) {
        if (memberIdxList.length < minSupport) continue;
        const members = memberIdxList.map((i) => remaining[i]);
        const prefCount = members.filter((im) => PREFERENCE_LEXICON.test(im.m.content)).length;
        const kind: ConsolidationKind =
          prefCount / members.length >= 0.5 ? "repeated_preference" : "repeated_fact";
        const stuff = members.map((im) => im.idx);
        groups.push(makeGroup(kind, undefined, stuff, idx, minSupport, {}));
        stuff.forEach((i) => assigned.add(i));
      }
    }
  }

  // ---- related: fallback when >=2 remaining share an entity ----
  {
    const entIndex = freshEntityIndex(idx, assigned);
    for (const key of sortedKeys(entIndex)) {
      const members = entIndex.get(key)!.map((i) => idx[i]);
      if (members.length < minSupport) continue;
      const stuff = members.map((im) => im.idx);
      groups.push(makeGroup("related", key, stuff, idx, minSupport, { sharedEntity: key }));
      stuff.forEach((i) => assigned.add(i));
    }
  }

  return groups;
}

// ---------------------------------------------------------------------------
// DB access
// ---------------------------------------------------------------------------

async function assertAccess(userId: string, workspaceId: string): Promise<void> {
  if (!(await userHasWorkspaceAccess(userId, workspaceId))) {
    throw new Error("FORBIDDEN");
  }
}

/**
 * Low-water mark for incremental consolidation: the newest consolidation
 * created_at for this workspace, falling back to the epoch.
 */
export async function getLastConsolidationAt(
  userId: string,
  workspaceId: string,
): Promise<string> {
  await assertAccess(userId, workspaceId);
  const rows = await queryTenant<{ at: string | null }>(
    userId,
    `SELECT MAX(created_at)::text AS at FROM consolidations WHERE workspace_id = $1`,
    [workspaceId],
  );
  return rows[0]?.at ? (rows[0].at as string) : new Date(0).toISOString();
}

const MEMORY_BATCH_SELECT = `
  mr.id, mr.content, mr.summary, mr.memory_type AS "memoryType",
  mr.occurred_at AS "occurredAt", mr.created_at AS "createdAt",
  mr.importance, mr.source_ref AS "sourceRef",
  COALESCE((
    SELECT json_agg(json_build_object('type', me.entity_type,
                                      'value', me.entity_value,
                                      'confidence', me.confidence)
                    ORDER BY me.confidence DESC NULLS LAST)
    FROM memory_entities me WHERE me.memory_id = mr.id
  ), '[]'::jsonb) AS entities
`;

function rowToMemory(r: Record<string, unknown>): ConsolidationMemoryInput {
  return {
    id: String(r.id),
    content: String(r.content ?? ""),
    summary: r.summary ? String(r.summary) : null,
    memoryType: r.memoryType as MemoryType,
    occurredAt: r.occurredAt ? String(r.occurredAt) : null,
    createdAt: String(r.createdAt),
    importance: Number(r.importance ?? 0),
    sourceRef: r.sourceRef ? String(r.sourceRef) : null,
    entities: (r.entities as ConsolidationMemoryEntity[] | null) ?? [],
  };
}

async function loadIncrementalBatch(
  userId: string,
  workspaceId: string,
  lastAt: string,
  limit: number,
): Promise<ConsolidationMemoryInput[]> {
  const primary = await queryTenant<Record<string, unknown>>(
    userId,
    `SELECT ${MEMORY_BATCH_SELECT}
       FROM memory_records mr
      WHERE mr.workspace_id = $1 AND mr.state = 'active' AND mr.updated_at > $2
      ORDER BY mr.updated_at ASC
      LIMIT $3`,
    [workspaceId, lastAt, limit],
  );

  const primaryMemories = primary.map(rowToMemory);
  const entityVals = Array.from(
    new Set<string>(
      primaryMemories.flatMap((m) => m.entities!.map((e) => String(e.value))).filter(Boolean),
    ),
  );

  let overlap: Record<string, unknown>[] = [];
  if (entityVals.length > 0) {
    overlap = await queryTenant<Record<string, unknown>>(
      userId,
      `SELECT DISTINCT ON (mr.id) ${MEMORY_BATCH_SELECT}
         FROM memory_records mr
         JOIN memory_entities me ON me.memory_id = mr.id
        WHERE mr.workspace_id = $1 AND mr.state = 'active'
          AND mr.updated_at > $2 - ($3::interval) AND mr.updated_at <= $2
          AND me.entity_value = ANY($4::text[])
        ORDER BY mr.id, mr.updated_at DESC
        LIMIT $5`,
      [workspaceId, lastAt, `${OVERLAP_WINDOW_MS} milliseconds`, entityVals, Math.min(200, limit)],
    );
  }

  const seen = new Set<string>();
  const merged: ConsolidationMemoryInput[] = [];
  const push = (m: ConsolidationMemoryInput): void => {
    if (!seen.has(m.id)) {
      seen.add(m.id);
      merged.push(m);
    }
  };
  primaryMemories.forEach(push);
  overlap.map(rowToMemory).forEach(push);
  return merged;
}

function buildSourceRefs(
  memories: ConsolidationMemoryInput[],
  memoryIds: string[],
): Record<string, unknown>[] {
  const byId = new Map(memories.map((m) => [m.id, m]));
  return memoryIds.map((id) => {
    const m = byId.get(id);
    return { memoryId: id, sourceRef: m?.sourceRef ?? null };
  });
}

/**
 * Incremental consolidation run: load the bounded batch, build groups, and
 * insert new active consolidations (idempotent per kind + sorted memory set).
 */
export async function runConsolidation(
  userId: string,
  workspaceId: string,
  opts: RunConsolidationOptions = {},
): Promise<{ groupsSeen: number; consolidationsCreated: number }> {
  await assertAccess(userId, workspaceId);
  const limit = Math.max(1, Math.min(MAX_BATCH_LIMIT, opts.limit ?? DEFAULT_BATCH_LIMIT));
  const lastAt = await getLastConsolidationAt(userId, workspaceId);
  const memories = await loadIncrementalBatch(userId, workspaceId, lastAt, limit);
  if (memories.length === 0) {
    return { groupsSeen: 0, consolidationsCreated: 0 };
  }

  const groups = buildConsolidationGroups(memories);
  let groupsSeen = 0;
  let created = 0;

  for (const g of groups) {
    if (opts.kind && g.kind !== opts.kind) continue;
    groupsSeen++;
    const sortedIds = [...g.memoryIds].sort();

    const existing = await queryTenant<{ id: string }>(
      userId,
      `SELECT id FROM consolidations
        WHERE workspace_id = $1 AND status = 'active' AND kind = $2
          AND supporting_memory_ids = $3
        LIMIT 1`,
      [workspaceId, g.kind, sortedIds],
    );
    if (existing.length > 0) continue;

    const inserted = await queryTenant<Record<string, unknown>>(
      userId,
      `INSERT INTO consolidations
         (workspace_id, owner_id, kind, title, summary,
          supporting_memory_ids, source_refs, confidence, status, meta, version)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', $9, 1)
       RETURNING ${CONSOLIDATION_SELECT}`,
      [
        workspaceId,
        userId,
        g.kind,
        g.title,
        g.summary,
        sortedIds,
        buildSourceRefs(memories, g.memoryIds),
        g.confidence,
        g.meta ?? {},
      ],
    );
    if (inserted.length > 0) created++;
  }

  return { groupsSeen, consolidationsCreated: created };
}

/** List consolidations for a workspace, newest first. */
export async function listConsolidations(
  userId: string,
  workspaceId: string,
  opts: ListConsolidationOptions = {},
): Promise<ConsolidationRecord[]> {
  await assertAccess(userId, workspaceId);
  const limit = Math.min(opts.limit ?? 50, MAX_LIST_LIMIT);
  const values: unknown[] = [workspaceId];
  let where = "workspace_id = $1";
  if (opts.kind) {
    values.push(opts.kind);
    where += ` AND kind = $${values.length}`;
  }
  values.push(limit);
  const rows = await queryTenant<Record<string, unknown>>(
    userId,
    `SELECT ${CONSOLIDATION_SELECT} FROM consolidations
      WHERE ${where}
      ORDER BY created_at DESC
      LIMIT $${values.length}`,
    values,
  );
  return rows.map(mapConsolidationRow);
}

/**
 * Mark an active consolidation as superseded, optionally bumping the version of
 * a replacement consolidation. Returns true on success.
 */
export async function supersedeConsolidation(
  userId: string,
  workspaceId: string,
  id: string,
  supersedingId?: string,
): Promise<boolean> {
  await assertAccess(userId, workspaceId);
  const targetRows = await queryTenant<Record<string, unknown>>(
    userId,
    `SELECT ${CONSOLIDATION_SELECT} FROM consolidations
      WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, id],
  );
  if (targetRows.length === 0) return false;
  const target = mapConsolidationRow(targetRows[0]);
  if (target.status !== "active") return false;

  await queryTenant(
    userId,
    `UPDATE consolidations SET status = 'superseded' WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, id],
  );

  if (supersedingId && supersedingId !== id) {
    const replacement = await queryTenant<{ id: string }>(
      userId,
      `SELECT id FROM consolidations
        WHERE workspace_id = $1 AND id = $2 AND status = 'active'
        LIMIT 1`,
      [workspaceId, supersedingId],
    );
    if (replacement.length > 0) {
      await queryTenant(
        userId,
        `UPDATE consolidations SET version = version + 1 WHERE workspace_id = $1 AND id = $2`,
        [workspaceId, supersedingId],
      );
    }
  }

  return true;
}
