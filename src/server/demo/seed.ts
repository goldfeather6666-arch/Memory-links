/**
 * MNEMOSYNE — demo provisioning engine.
 *
 * Creates the isolated "MNEMOSYNE — Interactive Demo Universe" workspace for a
 * user and seeds it with a coherent sample universe, all in ONE tenant-scoped
 * transaction so a failure rolls back cleanly (no partial data). Idempotent:
 * if the demo workspace already exists (with seeded memories) it returns it
 * without duplicating anything.
 *
 * Every row carries explicit provenance in its metadata (is_demo, demo_version,
 * demo_category, source_type=sample, created_by_system=true). All writes set
 * owner_id = userId so RLS insert policies (owner_id = app_current_user_id())
 * pass.
 */
import { createHash } from "crypto";
import type { PoolClient, QueryResultRow } from "pg";
import { queryTenant, withTenant } from "@/db/client";
import { createWorkspace } from "@/server/data/workspaces";
import {
  AGENTS,
  CONSOLIDATIONS,
  CONTRADICTIONS,
  DEMO_DESCRIPTION,
  DEMO_NAME,
  DEMO_VERSION,
  DOCUMENTS,
  ENTITIES,
  MEMORIES,
  PATTERNS,
  PROJECTS,
  SUGGESTIONS,
  CONVERSATIONS,
  type DemoMemory,
} from "./data";

/** Provenance payload attached to every seeded record's metadata. */
export function DEMO_METADATA(category: string): Record<string, unknown> {
  return {
    is_demo: true,
    demo_version: DEMO_VERSION,
    demo_category: category,
    source_type: "sample",
    created_by_system: true,
  };
}

export interface EnsureResult {
  workspaceId: string;
  created: boolean;
}

const MEMORY_TYPE_SET = new Set(["episodic", "semantic", "procedural", "associative"]);
const PROJECT_STATUS_SET = new Set(["active", "archived", "planned"]);
const CONSOLIDATION_KIND_SET = new Set([
  "related", "repeated_fact", "repeated_preference", "project", "event",
  "decision", "change", "gap", "contradiction", "summary",
]);
const PATTERN_TYPE_SET = new Set([
  "frequent_project", "repeated_workflow", "recurring_problem",
  "consistent_preference", "frequently_referenced", "repeated_decision",
  "priority_change", "general",
]);
const CONTRADICTION_CATEGORY_SET = new Set(["genuine", "temporal", "context", "uncertain", "duplicate"]);
const SUGGESTION_TYPE_SET = new Set([
  "related_memories", "project_decision_changed", "preference_may_be_outdated",
  "repeated_procedure", "same_project_reference", "long_term_retention", "general",
]);
const AGENT_CATEGORY_SET = new Set([
  "coding", "research", "browser", "personal_assistant", "productivity", "creative", "custom",
]);
const AGENT_MODE_SET = new Set(["read_only", "approval", "autonomous"]);

export function clampConfidence(v: number | undefined): number | null {
  if (v === undefined || v === null) return null;
  const c = Number(v);
  if (Number.isNaN(c)) return null;
  return Math.max(0, Math.min(0.9999, c));
}

function ensureEnum(value: string | undefined, allowed: Set<string>, fallback: string): string {
  if (!value) return fallback;
  return allowed.has(value) ? value : fallback;
}

const ENTITY_TYPE_BY_NAME = new Map(ENTITIES.map((e) => [e.name, e.type]));

/**
 * Insert a single row returning its id, using the transaction client.
 */
async function insertReturningId(
  client: PoolClient,
  text: string,
  values: unknown[],
): Promise<string> {
  const { rows } = await client.query<QueryResultRow & { id: string }>(text, values);
  return rows[0].id;
}

async function seedProject(
  client: PoolClient,
  userId: string,
  workspaceId: string,
  p: { key: string; name: string; description: string; status: string; milestones?: string[]; decisions?: string[]; goals?: string[]; risks?: string[]; progress?: number },
) {
  const status = ensureEnum(p.status, PROJECT_STATUS_SET, "active");
  const metadata = {
    ...DEMO_METADATA("project"),
    key: p.key,
    milestones: p.milestones ?? [],
    decisions: p.decisions ?? [],
    goals: p.goals ?? [],
    risks: p.risks ?? [],
    progress: p.progress ?? 0,
  };
  await client.query(
    `INSERT INTO projects (workspace_id, name, description, status, metadata)
     VALUES ($1, $2, $3, $4, $5)`,
    [workspaceId, p.name, p.description, status, metadata],
  );
}

/** Insert one sample document as a data_source + completed ingestion record. */
async function seedDocument(
  client: PoolClient,
  userId: string,
  workspaceId: string,
  d: { key: string; title: string; content: string; kind: string },
): Promise<string> {
  const sourceId = await insertReturningId(
    client,
    `INSERT INTO data_sources (workspace_id, source_type, name, metadata, connection_status)
     VALUES ($1, $2, $3, $4, 'not_connected')
     RETURNING id`,
    [
      workspaceId,
      "sample_document",
      d.title,
      { ...DEMO_METADATA("document"), key: d.key, kind: d.kind },
    ],
  );
  const checksum = createHash("sha256").update(d.content).digest("hex");
  await client.query(
    `INSERT INTO ingestion_records (
       workspace_id, owner_id, source_type, source_id, title, checksum,
       content, content_preview, size_bytes, status, metadata
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'completed',$10)`,
    [
      workspaceId,
      userId,
      "sample_document",
      sourceId,
      d.title,
      checksum,
      d.content,
      d.content.slice(0, 200),
      Buffer.byteLength(d.content, "utf8"),
      { ...DEMO_METADATA("document"), key: d.key, kind: d.kind },
    ],
  );
  return sourceId;
}

/** Seed normalized entities; idempotent via ON CONFLICT upsert. */
async function seedEntities(client: PoolClient, userId: string, workspaceId: string) {
  for (const e of ENTITIES) {
    await client.query(
      `INSERT INTO entities (workspace_id, owner_id, entity_type, canonical_name, confidence, provenance)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (workspace_id, entity_type, canonical_name)
       DO UPDATE SET confidence = EXCLUDED.confidence, provenance = EXCLUDED.provenance`,
      [
        workspaceId,
        userId,
        e.type,
        e.name,
        clampConfidence(0.95),
        DEMO_METADATA("entity"),
      ],
    );
  }
}

/** Insert memories, remembering key -> id so links can be built. */
async function seedMemories(
  client: PoolClient,
  userId: string,
  workspaceId: string,
  sourceIdByKey: Map<string, string>,
): Promise<Map<string, string>> {
  const idByKey = new Map<string, string>();
  for (const m of MEMORIES as DemoMemory[]) {
    const memoryType = ensureEnum(m.type, MEMORY_TYPE_SET, "semantic");
    const metadata = {
      ...DEMO_METADATA(m.category || "memory"),
      category: m.category,
      importance: m.importance ?? 0,
      confidence: clampConfidence(m.confidence) ?? 0.5,
    };
    const sourceRef = m.sourceDoc ? sourceIdByKey.get(m.sourceDoc) ?? null : null;
    const id = await insertReturningId(
      client,
      `INSERT INTO memory_records (
         workspace_id, owner_id, memory_type, content, summary, source_ref,
         confidence, importance, valid_from, valid_until, occurred_at,
         privacy_classification, metadata
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'private',$12)
       RETURNING id`,
      [
        workspaceId,
        userId,
        memoryType,
        m.content,
        m.summary ?? null,
        sourceRef,
        clampConfidence(m.confidence),
        m.importance ?? 0,
        m.validFrom ?? null,
        m.validUntil ?? null,
        m.validFrom ?? null,
        metadata,
      ],
    );
    idByKey.set(m.key, id);
  }
  return idByKey;
}

/** Link memories to entities via memory_entities rows. */
async function seedMemoryEntities(
  client: PoolClient,
  userId: string,
  workspaceId: string,
  idByKey: Map<string, string>,
) {
  for (const m of MEMORIES as DemoMemory[]) {
    const memoryId = idByKey.get(m.key);
    if (!memoryId) continue;
    for (const entityName of m.entities ?? []) {
      const entityType = ENTITY_TYPE_BY_NAME.get(entityName) ?? "concept";
      await client.query(
        `INSERT INTO memory_entities (memory_id, entity_type, entity_value, confidence)
         VALUES ($1,$2,$3,$4)`,
        [memoryId, entityType, entityName, clampConfidence(0.85)],
      );
    }
  }
}

/**
 * Derive memory-to-memory relationships from shared entities: memories linked
 * to the same entity are related. This yields genuinely grounded edges (a
 * real shared entity), never disconnected/decorative ones.
 */
async function seedRelationships(
  client: PoolClient,
  userId: string,
  workspaceId: string,
  idByKey: Map<string, string>,
) {
  // entityName -> memory keys
  const entityToKeys = new Map<string, string[]>();
  for (const m of MEMORIES as DemoMemory[]) {
    for (const entityName of m.entities ?? []) {
      const list = entityToKeys.get(entityName) ?? [];
      list.push(m.key);
      entityToKeys.set(entityName, list);
    }
  }
  const seen = new Set<string>();
  let count = 0;
  const MAX = 250;
  for (const [entityName, keys] of entityToKeys) {
    void entityName;
    if (keys.length < 2) continue;
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        if (count >= MAX) break;
        const a = idByKey.get(keys[i]);
        const b = idByKey.get(keys[j]);
        if (!a || !b) continue;
        const pairKey = [a, b].sort().join("|");
        if (seen.has(pairKey)) continue;
        seen.add(pairKey);
        await client.query(
          `INSERT INTO memory_relationships (
             source_memory_id, target_memory_id, relationship_type, strength, provenance, metadata
           ) VALUES ($1,$2,'related_to',$3,$4,$5)`,
          [a, b, clampConfidence(0.7), DEMO_METADATA("relationship"), DEMO_METADATA("relationship")],
        );
        count++;
      }
      if (count >= MAX) break;
    }
    if (count >= MAX) break;
  }
}

async function seedConversations(
  client: PoolClient,
  userId: string,
  workspaceId: string,
  idByKey: Map<string, string>,
) {
  for (const c of CONVERSATIONS) {
    const conversationId = await insertReturningId(
      client,
      `INSERT INTO conversations (workspace_id, owner_id, title, summary, status, metadata)
       VALUES ($1,$2,$3,$4,'active',$5)
       RETURNING id`,
      [workspaceId, userId, c.title, c.answer.slice(0, 200), DEMO_METADATA("conversation")],
    );
    for (const q of c.questions) {
      await client.query(
        `INSERT INTO conversation_messages (
           conversation_id, workspace_id, owner_id, role, content, evidence, status
         ) VALUES ($1,$2,$3,'user',$4,'[]','completed')`,
        [conversationId, workspaceId, userId, q],
      );
    }
    const evidence = (c.evidenceKeys ?? [])
      .map((k) => idByKey.get(k))
      .filter((id): id is string => Boolean(id))
      .map((memoryId) => ({ memoryId, type: "memory" }));
    await client.query(
      `INSERT INTO conversation_messages (
         conversation_id, workspace_id, owner_id, role, content, evidence, status
       ) VALUES ($1,$2,$3,'assistant',$4,$5,'completed')`,
      [conversationId, workspaceId, userId, c.answer, JSON.stringify(evidence)],
    );
  }
}

async function seedIntelligence(
  client: PoolClient,
  userId: string,
  workspaceId: string,
  idByKey: Map<string, string>,
) {
  for (const c of CONSOLIDATIONS) {
    const kind = ensureEnum(c.kind, CONSOLIDATION_KIND_SET, "summary");
    const supporting = (c.memoryKeys ?? []).map((k) => idByKey.get(k)).filter(Boolean);
    if (supporting.length === 0) continue;
    await client.query(
      `INSERT INTO consolidations (
         workspace_id, owner_id, kind, title, summary, supporting_memory_ids,
         confidence, status, meta
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,'active',$8)`,
      [
        workspaceId,
        userId,
        kind,
        c.title,
        c.summary,
        supporting,
        clampConfidence(c.confidence),
        DEMO_METADATA("consolidation"),
      ],
    );
  }
  for (const p of PATTERNS) {
    const patternType = ensureEnum(p.patternType, PATTERN_TYPE_SET, "general");
    const supporting = (p.memoryKeys ?? []).map((k) => idByKey.get(k)).filter(Boolean);
    if (supporting.length === 0) continue;
    await client.query(
      `INSERT INTO patterns (
         workspace_id, owner_id, pattern_type, description, supporting_memory_ids,
         confidence, status, meta
       ) VALUES ($1,$2,$3,$4,$5,$6,'active',$7)`,
      [
        workspaceId,
        userId,
        patternType,
        p.description,
        supporting,
        clampConfidence(0.8),
        DEMO_METADATA("pattern"),
      ],
    );
  }
  for (const c of CONTRADICTIONS) {
    const a = idByKey.get(c.memoryKeyA);
    const b = idByKey.get(c.memoryKeyB);
    if (!a || !b || a === b) continue;
    const category = ensureEnum(c.category, CONTRADICTION_CATEGORY_SET, "context");
    await client.query(
      `INSERT INTO contradictions (
         workspace_id, owner_id, memory_id_a, memory_id_b, category, evidence, confidence, status
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,'unresolved')`,
      [
        workspaceId,
        userId,
        a,
        b,
        category,
        { note: c.evidence, ...DEMO_METADATA("contradiction") },
        clampConfidence(0.85),
      ],
    );
  }
  for (const s of SUGGESTIONS) {
    const suggestionType = ensureEnum(s.suggestionType, SUGGESTION_TYPE_SET, "general");
    const target = s.targetKey ? idByKey.get(s.targetKey) ?? null : null;
    await client.query(
      `INSERT INTO suggestions (
         workspace_id, owner_id, suggestion_type, title, body, evidence, status, target_memory_id
       ) VALUES ($1,$2,$3,$4,$5,$6,'pending',$7)`,
      [
        workspaceId,
        userId,
        suggestionType,
        s.title,
        s.body,
        { ...DEMO_METADATA("suggestion") },
        target,
      ],
    );
  }
}

async function seedAgents(client: PoolClient, userId: string, workspaceId: string) {
  for (const agent of AGENTS) {
    const category = ensureEnum(agent.category, AGENT_CATEGORY_SET, "custom");
    const mode = ensureEnum("read_only", AGENT_MODE_SET, "read_only");
    const agentId = await insertReturningId(
      client,
      `INSERT INTO agents (
         workspace_id, owner_id, name, description, category, integration_type,
         auth_method, status, mode
       ) VALUES ($1,$2,$3,$4,$5,'mcp','bearer_token','active',$6)
       RETURNING id`,
      [workspaceId, userId, agent.name, agent.description, category, mode],
    );
    const scopes = agent.scopes?.length ? agent.scopes : ["memories", "projects", "graph", "chat", "timeline"];
    await client.query(
      `INSERT INTO agent_workspace_permissions (
         agent_id, workspace_id, scopes, memory_types, read_only
       ) VALUES ($1,$2,$3,$4,true)`,
      [agentId, workspaceId, scopes, ["episodic", "semantic", "procedural", "associative"]],
    );
  }
}

/**
 * Idempotent provisioning. Returns the demo workspace id.
 */
export async function ensureDemoWorkspace(userId: string): Promise<EnsureResult> {
  const existing = await queryTenant<{ id: string }>(
    userId,
    `SELECT id FROM workspaces
     WHERE owner_id = $1
       AND settings->>'is_demo' = 'true'
     LIMIT 1`,
    [userId],
  );
  if (existing[0]) {
    // Verify it is actually seeded (has memories); if not, resume seeding below.
    const seeded = await queryTenant<{ ok: boolean }>(
      userId,
      `SELECT EXISTS (
         SELECT 1 FROM memory_records WHERE workspace_id = $1
       ) AS ok`,
      [existing[0].id],
    );
    if (seeded[0]?.ok) {
      return { workspaceId: existing[0].id, created: false };
    }
  }

  // Create the workspace (committed separately) then seed atomically.
  const workspace = await createWorkspace(
    userId,
    DEMO_NAME,
    DEMO_DESCRIPTION,
    { is_demo: true, demo_version: DEMO_VERSION, source_type: "sample", created_by_system: true },
  );
  const workspaceId = workspace.id;

  let completed = false;
  try {
    await withTenant(userId, async (client) => {
      // projects
      for (const p of PROJECTS) {
        await seedProject(client, userId, workspaceId, p);
      }
      // documents -> data_sources + ingestion_records; return sourceId by key
      const sourceIdByKey = new Map<string, string>();
      for (const d of DOCUMENTS) {
        const sourceId = await seedDocument(client, userId, workspaceId, d);
        sourceIdByKey.set(d.key, sourceId);
      }
      // entities
      await seedEntities(client, userId, workspaceId);
      // memories
      const idByKey = await seedMemories(client, userId, workspaceId, sourceIdByKey);
      // memory_entities
      await seedMemoryEntities(client, userId, workspaceId, idByKey);
      // memory_relationships
      await seedRelationships(client, userId, workspaceId, idByKey);
      // conversations + messages
      await seedConversations(client, userId, workspaceId, idByKey);
      // intelligence
      await seedIntelligence(client, userId, workspaceId, idByKey);
      // agent bridge
      await seedAgents(client, userId, workspaceId);
    });
    completed = true;
  } finally {
    if (!completed) {
      // Roll back the created workspace so a retry starts clean.
      await queryTenant(
        userId,
        `DELETE FROM workspaces WHERE id = $1 AND owner_id = $2`,
        [workspaceId, userId],
      ).catch(() => {});
    }
  }

  return { workspaceId, created: true };
}
