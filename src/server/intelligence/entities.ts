/**
 * MNEMOSYNE Part 4 — entity & relationship enrichment.
 *
 * Normalizes entities extracted by the memory engine into a canonical,
 * workspace-scoped `entities` table (with aliases), and enriches the
 * `memory_relationships` graph with explicitly supported, classified
 * relationship types. Every DB function gates on workspace membership
 * (userHasWorkspaceAccess) and filters by workspace_id. Memory content is
 * treated as untrusted data: heuristics only add evidence-backed entities and
 * never invent facts or psychological/sensitive diagnoses.
 */

import { queryTenant } from "@/db/client";
import { userHasWorkspaceAccess } from "@/server/data/workspaces";
import type {
  EntityAliasRecord,
  EntityRecord,
  EntityType,
  NormalizedEntity,
  RelationshipType,
} from "./types";
import { ENTITY_TYPES, RELATIONSHIP_TYPES } from "./types";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function clampConfidence(confidence: number): number {
  if (!Number.isFinite(confidence)) return 0;
  return Math.min(1, Math.max(0, confidence));
}

/**
 * Pure: trim, collapse whitespace, title-case each word while preserving
 * acronyms (all-caps tokens or tokens with 2+ capitals stay uppercase).
 * Returns the canonical form; empty input yields "".
 */
export function normalizeEntityName(name: string): string {
  const cleaned = String(name ?? "")
    .trim()
    .replace(/\s+/g, " ");
  if (!cleaned) return "";

  return cleaned
    .split(" ")
    .map((word) => {
      if (!word) return word;
      // Keep acronyms uppercase (e.g. "AI", "OpenAI", "iOS").
      if (/^[A-Z]{2,}$/.test(word) || (word.match(/[A-Z]/g) ?? []).length >= 2) {
        return word;
      }
      const lower = word.toLowerCase();
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

/**
 * Evidence-backed organization candidates: names followed by a company suffix
 * (Inc/Corp/LLC/Ltd/GmbH/Limited). This is the only content heuristic used so
 * we never guess identity beyond explicit, named signals.
 */
const ORG_SUFFIX_RE =
  /\b([A-Z][A-Za-z0-9&.'-]+(?:\s+[A-Z][A-Za-z0-9&.'-]+)*)\s+(Inc\.?|Corp\.?|LLC|Ltd\.?|GmbH|Limited)\b/g;

function detectOrganizationCandidates(text: string): NormalizedEntity[] {
  const out: NormalizedEntity[] = [];
  if (!text) return out;
  const re = new RegExp(ORG_SUFFIX_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const full = m[0].trim();
    const canonical = normalizeEntityName(full);
    if (!canonical) continue;
    const nameOnly = normalizeEntityName(m[1].trim());
    const aliases: string[] = [];
    if (nameOnly && nameOnly !== canonical) aliases.push(nameOnly);
    if (full !== canonical) aliases.push(full);
    out.push({ canonicalName: canonical, entityType: "organization", aliases, confidence: 0.5 });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Candidate extraction (pure)
// ---------------------------------------------------------------------------

export interface EntityCandidateMemoryInput {
  id: string;
  content: string;
  summary?: string | null;
  entities: ReadonlyArray<{ type: string; value: string; confidence: number }>;
}

/**
 * Pure: convert an active memory's memory_entities rows plus content heuristics
 * into normalized entity candidates. Multiple rows mapping to the same
 * canonical entity are merged (max confidence, union of aliases).
 */
export function candidateEntitiesFromMemory(memoryRow: EntityCandidateMemoryInput): NormalizedEntity[] {
  const byKey = new Map<string, NormalizedEntity>();

  const upsert = (ent: NormalizedEntity): void => {
    const key = `${ent.entityType}\u0000${ent.canonicalName.toLowerCase()}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, ent);
      return;
    }
    existing.confidence = Math.max(existing.confidence, ent.confidence);
    for (const a of ent.aliases) {
      if (!existing.aliases.includes(a)) existing.aliases.push(a);
    }
  };

  for (const row of memoryRow.entities) {
    const value = String(row.value ?? "").trim();
    if (!value) continue;
    const canonical = normalizeEntityName(value);
    if (!canonical) continue;
    const type: EntityType = ENTITY_TYPES.includes(row.type as EntityType)
      ? (row.type as EntityType)
      : "concept";
    const aliases = canonical === value ? [] : [value];
    upsert({
      canonicalName: canonical,
      entityType: type,
      aliases,
      confidence: clampConfidence(typeof row.confidence === "number" ? row.confidence : 0.5),
    });
  }

  const text = [memoryRow.content, memoryRow.summary ?? ""].filter(Boolean).join(" ");
  for (const org of detectOrganizationCandidates(text)) {
    upsert(org);
  }

  return Array.from(byKey.values());
}

// ---------------------------------------------------------------------------
// Entity persistence
// ---------------------------------------------------------------------------

interface PersistResult {
  id: string;
  created: boolean;
  aliasesCreated: number;
}

/**
 * Upsert a normalized entity (preserving the canonical row) and insert any
 * aliases that are not already present. Returns the entity id, whether the row
 * was newly created, and how many aliases were inserted.
 */
async function persistEntity(
  userId: string,
  workspaceId: string,
  ent: NormalizedEntity,
  provenance: Record<string, unknown>,
): Promise<PersistResult> {
  const canonicalName = normalizeEntityName(ent.canonicalName);
  const rows = await queryTenant<{ id: string; inserted: boolean }>(
    userId,
    `INSERT INTO entities (workspace_id, owner_id, entity_type, canonical_name, confidence, provenance)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (workspace_id, entity_type, canonical_name) DO UPDATE SET
       confidence = GREATEST(entities.confidence, EXCLUDED.confidence),
       provenance = entities.provenance || EXCLUDED.provenance,
       updated_at = now()
     RETURNING id, (xmax = 0) AS inserted`,
    [workspaceId, userId, ent.entityType, canonicalName, ent.confidence, provenance],
  );

  const id = String(rows[0].id);
  const created = Boolean(rows[0].inserted);
  let aliasesCreated = 0;
  const seen = new Set<string>();

  for (const rawAlias of ent.aliases) {
    const alias = String(rawAlias ?? "").trim().replace(/\s+/g, " ");
    if (!alias || seen.has(alias.toLowerCase())) continue;
    seen.add(alias.toLowerCase());
    const inserted = await queryTenant<{ id: string }>(
      userId,
      `INSERT INTO entity_aliases (entity_id, alias)
       VALUES ($1, $2)
       ON CONFLICT (entity_id, lower(alias)) DO NOTHING
       RETURNING id`,
      [id, alias],
    );
    if (inserted.length > 0) aliasesCreated += 1;
  }

  return { id, created, aliasesCreated };
}

/**
 * Ensure a normalized entity exists (upsert + aliases) and return its id.
 * Optional `provenance` is merged into the entity's provenance jsonb.
 */
export async function ensureEntity(
  userId: string,
  workspaceId: string,
  ent: NormalizedEntity,
  provenance: Record<string, unknown> = {},
): Promise<string> {
  if (!(await userHasWorkspaceAccess(userId, workspaceId))) {
    throw new Error("FORBIDDEN");
  }
  const result = await persistEntity(userId, workspaceId, ent, {
    ...provenance,
    source: provenance.source ?? "manual",
  });
  return result.id;
}

// ---------------------------------------------------------------------------
// Entity enrichment run
// ---------------------------------------------------------------------------

export interface EntityEnrichmentResult {
  entitiesProcessed: number;
  entitiesCreated: number;
  aliasesCreated: number;
}

/**
 * Load active memories, collect candidate entities, and ensure each (respecting
 * opts.limit, default 200). Idempotent: a second run creates no duplicate rows.
 */
export async function runEntityEnrichment(
  userId: string,
  workspaceId: string,
  opts: { limit?: number } = {},
): Promise<EntityEnrichmentResult> {
  if (!(await userHasWorkspaceAccess(userId, workspaceId))) {
    throw new Error("FORBIDDEN");
  }
  const limit = Math.max(0, opts.limit ?? 200);

  const memoryRows = await queryTenant<Record<string, unknown>>(
    userId,
    `SELECT m.id, m.content, m.summary,
            COALESCE(
              (SELECT json_agg(json_build_object('type', e.entity_type, 'value', e.entity_value, 'confidence', e.confidence)
                               ORDER BY e.confidence DESC NULLS LAST)
               FROM memory_entities e WHERE e.memory_id = m.id),
              '[]'::json
            ) AS entities
       FROM memory_records m
      WHERE m.workspace_id = $1 AND m.state = 'active'
      ORDER BY m.created_at`,
    [workspaceId],
  );

  const groups = new Map<string, { ent: NormalizedEntity; memoryIds: string[] }>();

  for (const mr of memoryRows) {
    const entities = (mr.entities as unknown[]) ?? [];
    const input: EntityCandidateMemoryInput = {
      id: String(mr.id),
      content: String(mr.content ?? ""),
      summary: mr.summary ? String(mr.summary) : null,
      entities: entities.map((e) => {
        const rec = e as Record<string, unknown>;
        return {
          type: String(rec.type ?? ""),
          value: String(rec.value ?? ""),
          confidence: Number(rec.confidence ?? 0),
        };
      }),
    };

    for (const ent of candidateEntitiesFromMemory(input)) {
      const key = `${ent.entityType}\u0000${ent.canonicalName.toLowerCase()}`;
      const existing = groups.get(key);
      if (!existing) {
        groups.set(key, { ent, memoryIds: [input.id] });
        continue;
      }
      existing.ent.confidence = Math.max(existing.ent.confidence, ent.confidence);
      for (const a of ent.aliases) {
        if (!existing.ent.aliases.includes(a)) existing.ent.aliases.push(a);
      }
      if (!existing.memoryIds.includes(input.id)) existing.memoryIds.push(input.id);
    }
  }

  const processed = Array.from(groups.values()).slice(0, limit);
  let entitiesCreated = 0;
  let aliasesCreated = 0;

  for (const group of processed) {
    const result = await persistEntity(userId, workspaceId, group.ent, {
      source: "entity_enrichment",
      memoryIds: group.memoryIds,
    });
    if (result.created) entitiesCreated += 1;
    aliasesCreated += result.aliasesCreated;
  }

  return { entitiesProcessed: processed.length, entitiesCreated, aliasesCreated };
}

// ---------------------------------------------------------------------------
// Relationship enrichment
// ---------------------------------------------------------------------------

interface ClassifiedRelationship {
  type: RelationshipType;
  /** "A"/"B" = the memory whose content matched the verb; null = order by id. */
  source: "A" | "B" | null;
  confidence: number;
  verb: string | null;
}

const VERB_PATTERNS: ReadonlyArray<{ type: RelationshipType; label: string; re: RegExp }> = [
  { type: "works_on", label: "works_on", re: /\bworks?\s+on\b|\bworking\s+on\b|\bbuilding\b|\bdeveloping\b/ },
  { type: "uses", label: "uses", re: /\buses?\b|\busing\b|\bleverage[sd]?\b|\bemploy[sd]?\b/ },
  { type: "created", label: "created", re: /\bcreat[ed]?\b|\bbuilt\b|\bfound[ed]?\b|\blaunch[ed]?\b/ },
  { type: "owns", label: "owns", re: /\bowns?\b|\bacquir[ed]?\b|\bbought\b|\bpurchas[ed]?\b/ },
  { type: "depends_on", label: "depends_on", re: /\bdepends?\s+on\b|\breli[es]?\s+on\b|\brequires?\b/ },
  { type: "replaced_by", label: "replaced_by", re: /\breplac[ed]?\b|\bsupersed[ed]?\b/ },
  { type: "participated_in", label: "participated_in", re: /\bparticipat[ed]?\s+in\b|\battend[ed]?\b/ },
  { type: "decided", label: "decided", re: /\bdecid[ed]?\b|\bchose\b|\bdecides\b/ },
  { type: "located_in", label: "located_in", re: /\blocated\s+in\b|\bheadquarter[ed]?\b|\bbased\s+in\b/ },
];

/**
 * Classify a relationship between two memories that reference the same entity.
 * Only emits a type from the RELATIONSHIP_TYPES taxonomy. Same-document
 * co-occurrence and unsupported links are never produced. For project/person
 * entities with no verb evidence, a supported `related_to` relationship is
 * still emitted (shared entity across two distinct memories is explicit
 * support); everything else is skipped.
 */
function classifyRelationship(
  textA: string,
  textB: string,
  entityType: string,
): ClassifiedRelationship | null {
  for (const v of VERB_PATTERNS) {
    const inA = v.re.test(textA);
    const inB = v.re.test(textB);
    if (inA && inB) {
      return { type: v.type, source: null, confidence: 0.7, verb: v.label };
    }
    if (inA) {
      return { type: v.type, source: "A", confidence: 0.7, verb: v.label };
    }
    if (inB) {
      return { type: v.type, source: "B", confidence: 0.7, verb: v.label };
    }
  }

  if (entityType === "project" || entityType === "person") {
    return { type: "related_to", source: null, confidence: 0.55, verb: null };
  }

  return null;
}

interface PairRow {
  aid: string;
  bid: string;
  etype: string;
  evalue: string;
}

/**
 * Enrich the relationship graph for active memories that share a canonical
 * entity. Never auto-creates 'shares_entity' and never links same-document
 * co-occurrence. Skips pairs that already have a relationship (idempotent).
 * Returns the number of relationships created.
 */
export async function enrichRelationships(
  userId: string,
  workspaceId: string,
  opts: { limit?: number } = {},
): Promise<number> {
  if (!(await userHasWorkspaceAccess(userId, workspaceId))) {
    throw new Error("FORBIDDEN");
  }
  const limit = Math.max(0, opts.limit ?? 200);

  const pairs = await queryTenant<PairRow>(
    userId,
    `SELECT a.memory_id AS aid, b.memory_id AS bid,
            a.entity_type AS etype, a.entity_value AS evalue
       FROM memory_entities a
       JOIN memory_entities b
         ON b.memory_id > a.memory_id
        AND b.entity_type = a.entity_type
        AND lower(b.entity_value) = lower(a.entity_value)
       JOIN memory_records ar ON ar.id = a.memory_id
        AND ar.workspace_id = $1 AND ar.state = 'active'
       JOIN memory_records br ON br.id = b.memory_id
        AND br.workspace_id = $1 AND br.state = 'active'
      ORDER BY a.memory_id, b.memory_id
      LIMIT $2`,
    [workspaceId, limit],
  );

  const textCache = new Map<string, string>();
  const getText = async (id: string): Promise<string> => {
    const cached = textCache.get(id);
    if (cached !== undefined) return cached;
    const rows = await queryTenant<{ content: string; summary: string | null }>(
      userId,
      "SELECT content, summary FROM memory_records WHERE id = $1",
      [id],
    );
    const r = rows[0];
    const text = r ? [r.content, r.summary ?? ""].filter(Boolean).join(" ") : "";
    textCache.set(id, text);
    return text;
  };

  let created = 0;

  for (const pair of pairs) {
    const [textA, textB] = await Promise.all([getText(pair.aid), getText(pair.bid)]);
    const cls = classifyRelationship(textA, textB, pair.etype);
    if (!cls) continue;

    const exists = await queryTenant<{ ok: boolean }>(
      userId,
      `SELECT EXISTS (
         SELECT 1 FROM memory_relationships
         WHERE (source_memory_id = $1 AND target_memory_id = $2)
            OR (source_memory_id = $2 AND target_memory_id = $1)
       ) AS ok`,
      [pair.aid, pair.bid],
    );
    if (exists[0]?.ok) continue;

    const source =
      cls.source === "A" ? pair.aid : cls.source === "B" ? pair.bid : pair.aid < pair.bid ? pair.aid : pair.bid;
    const target = source === pair.aid ? pair.bid : pair.aid;

    await queryTenant(
      userId,
      `INSERT INTO memory_relationships (source_memory_id, target_memory_id, relationship_type, strength, metadata, provenance)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        source,
        target,
        cls.type,
        cls.confidence,
        { entity_type: pair.etype, entity_value: pair.evalue, verb: cls.verb },
        { source: "entity_enrichment", relation: "classifier" },
      ],
    );
    created += 1;
  }

  return created;
}

// ---------------------------------------------------------------------------
// Reads for dashboard/UI
// ---------------------------------------------------------------------------

const ENTITY_SELECT = `
  id, workspace_id AS "workspaceId", owner_id AS "ownerId",
  entity_type AS "entityType", canonical_name AS "canonicalName",
  confidence, provenance, created_at AS "createdAt", updated_at AS "updatedAt"
`;

function mapEntityRow(row: Record<string, unknown>): EntityRecord {
  return {
    id: String(row.id),
    workspaceId: String(row.workspaceId),
    ownerId: String(row.ownerId),
    entityType: row.entityType as EntityType,
    canonicalName: String(row.canonicalName),
    confidence: row.confidence !== null && row.confidence !== undefined ? Number(row.confidence) : null,
    provenance: (row.provenance as Record<string, unknown>) ?? {},
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
  };
}

export async function listEntities(userId: string, workspaceId: string): Promise<EntityRecord[]> {
  if (!(await userHasWorkspaceAccess(userId, workspaceId))) {
    throw new Error("FORBIDDEN");
  }
  const rows = await queryTenant<Record<string, unknown>>(
    userId,
    `SELECT ${ENTITY_SELECT} FROM entities
      WHERE workspace_id = $1
      ORDER BY confidence DESC NULLS LAST, updated_at DESC`,
    [workspaceId],
  );
  return rows.map(mapEntityRow);
}

export async function getEntityAliases(
  userId: string,
  workspaceId: string,
  entityId: string,
): Promise<EntityAliasRecord[]> {
  if (!(await userHasWorkspaceAccess(userId, workspaceId))) {
    throw new Error("FORBIDDEN");
  }
  const rows = await queryTenant<Record<string, unknown>>(
    userId,
    `SELECT a.id, a.entity_id AS "entityId", a.alias, a.created_at AS "createdAt"
       FROM entity_aliases a
       JOIN entities e ON e.id = a.entity_id
      WHERE a.entity_id = $1 AND e.workspace_id = $2
      ORDER BY a.created_at ASC`,
    [entityId, workspaceId],
  );
  return rows.map((r) => ({
    id: String(r.id),
    entityId: String(r.entityId),
    alias: String(r.alias),
    createdAt: String(r.createdAt),
  }));
}

// Keep RELATIONSHIP_TYPES referenced so the taxonomy stays linked to this module
// (used by callers for validation/UI; not imported elsewhere yet).
export { RELATIONSHIP_TYPES };
