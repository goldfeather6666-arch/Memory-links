/**
 * MNEMOSYNE Part 5 — knowledge graph projection service.
 *
 * Builds a workspace-scoped graph from real records:
 *   - nodes: `entities` (entity nodes) and active `memory_records` (memory nodes)
 *   - edges: `memory_relationships` (memory↔memory) plus implicit reference
 *     links between memories and entities (memory_entities → entities)
 *
 * Every function gates on workspace membership. The service is deliberately
 * deterministic when no AI provider is configured — nothing is fabricated.
 * Pure helpers (node mapping, CSV, cluster detection, temporal existence) are
 * exported for deterministic unit tests.
 */

import { queryTenant } from "@/db/client";
import { userHasWorkspaceAccess } from "@/server/data/workspaces";
import type { QueryResultRow as PgRow } from "pg";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GraphNode {
  id: string;
  kind: "memory" | "entity";
  type: string;
  label: string;
  subtitle: string | null;
  importance: number;
  weight: number;
  confidence: number | null;
  createdAt: string;
  updatedAt: string;
  occurredAt: string | null;
  validFrom: string | null;
  validUntil: string | null;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  directed: boolean;
  strength: number;
  confidence: number | null;
  createdAt: string;
}

export interface GraphProjection {
  nodes: GraphNode[];
  edges: GraphEdge[];
  truncated: { nodes: boolean; edges: boolean };
}

export type GraphMode =
  | "universe"
  | "project"
  | "person"
  | "topic"
  | "timeline"
  | "focus";

export interface GraphProjectOptions {
  userId: string;
  workspaceId: string;
  mode?: GraphMode;
  projectId?: string;
  focusId?: string;
  focusKind?: "memory" | "entity";
  topic?: string;
  nodeTypes?: string[];
  relationshipTypes?: string[];
  minImportance?: number;
  minConfidence?: number;
  from?: string;
  to?: string;
  hideDisconnected?: boolean;
  limitNodes?: number;
  limitEdges?: number;
}

export interface GraphMetrics {
  totalEntities: number;
  totalActiveMemories: number;
  totalRelationships: number;
  entityCategoryCounts: { type: string; count: number }[];
  memoryTypeCounts: { type: string; count: number }[];
  growth: { month: string; nodes: number }[];
  recentEdges: {
    id: string;
    source: string;
    target: string;
    type: string;
    createdAt: string;
  }[];
}

export interface GraphSnapshotInput {
  name: string;
  mode: string;
  nodeIds: string[];
  edgeIds: string[];
  filter?: Record<string, unknown>;
}

export interface GraphSnapshotRecord {
  id: string;
  workspaceId: string;
  ownerId: string;
  name: string;
  mode: string;
  nodeIds: string[];
  edgeIds: string[];
  filter: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Constants & pure helpers
// ---------------------------------------------------------------------------

const DIRECTED_TYPES = new Set([
  "works_on",
  "owns",
  "uses",
  "created",
  "depends_on",
  "replaced_by",
  "participated_in",
  "decided",
  "located_in",
]);

export const NODE_TYPES = [
  "person",
  "organization",
  "product",
  "project",
  "location",
  "technology",
  "event",
  "concept",
] as const;

export const RELATIONSHIP_TYPES = [
  "works_on",
  "owns",
  "uses",
  "created",
  "related_to",
  "depends_on",
  "replaced_by",
  "participated_in",
  "decided",
  "located_in",
  "shares_entity",
] as const;

export function clamp01(n: number): number {
  const v = Number.isFinite(n) ? n : 0;
  return Math.max(0, Math.min(1, v));
}

export function isDirected(type: string): boolean {
  return DIRECTED_TYPES.has(type);
}

export function fmtIso(v: unknown): string {
  if (!v) return "";
  return String(v);
}

export function fmtMaybeIso(v: unknown): string | null {
  if (!v) return null;
  return String(v);
}

export function entityNodeId(id: string): string {
  return `entity:${id}`;
}

export function memoryNodeId(id: string): string {
  return `memory:${id}`;
}

/** Normalize an `entities` row → GraphNode. */
export function normalizeEntityNode(row: PgRow): GraphNode {
  const confidence = row.confidence != null ? Number(row.confidence) : null;
  return {
    id: entityNodeId(String(row.id)),
    kind: "entity",
    type: String(row.type ?? "concept"),
    label: String(row.label ?? row.canonical_name ?? "Entity"),
    subtitle: null,
    importance: Math.round(clamp01(confidence ?? 0.5) * 100),
    weight: clamp01(confidence ?? 0.5),
    confidence,
    createdAt: fmtIso(row.createdAt),
    updatedAt: fmtIso(row.updatedAt),
    occurredAt: null,
    validFrom: null,
    validUntil: null,
  };
}

/** Normalize an active `memory_records` row → GraphNode. */
export function normalizeMemoryNode(row: PgRow): GraphNode {
  const confidence = row.confidence != null ? Number(row.confidence) : null;
  const importance = row.importance != null ? Number(row.importance) : 0;
  const content = String(row.content ?? "");
  const summary = row.summary ? String(row.summary) : null;
  const label =
    summary && summary.trim()
      ? summary.trim()
      : content.trim().length > 120
        ? `${content.trim().slice(0, 120)}…`
        : content.trim() || "Memory";
  const confidenceFactor = clamp01(confidence ?? 0.5);
  const weight = clamp01((importance / 100) * (0.5 + 0.5 * confidenceFactor));
  return {
    id: memoryNodeId(String(row.id)),
    kind: "memory",
    type: String(row.type ?? "semantic"),
    label,
    subtitle: String(row.type ?? "semantic"),
    importance,
    weight,
    confidence,
    createdAt: fmtIso(row.createdAt),
    updatedAt: fmtIso(row.updatedAt),
    occurredAt: fmtMaybeIso(row.occurredAt),
    validFrom: fmtMaybeIso(row.validFrom),
    validUntil: fmtMaybeIso(row.validUntil),
  };
}

/**
 * Whether a node existed (was valid) at a given ISO instant. `createdAt` is
 * the lower bound; `validFrom`/`validUntil` narrow the window when present.
 * String comparison on ISO-8601 timestamps (same format) is timezone-safe for
 * our purposes. Invalid dates are treated as "always existed".
 */
export function nodeExistsAt(node: GraphNode, atIso: string): boolean {
  const at = Date.parse(atIso);
  if (Number.isNaN(at)) return true;
  const created = Date.parse(node.createdAt);
  if (!Number.isNaN(created) && at < created) return false;
  if (node.validFrom) {
    const vf = Date.parse(node.validFrom);
    if (!Number.isNaN(vf) && at < vf) return false;
  }
  if (node.validUntil) {
    const vu = Date.parse(node.validUntil);
    if (!Number.isNaN(vu) && at > vu) return false;
  }
  return true;
}

/** Remove nodes with no edges (and edges whose endpoints were removed). */
export function dropDisconnectedNodes(
  nodes: GraphNode[],
  edges: GraphEdge[],
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const degree = new Map<string, number>();
  for (const n of nodes) degree.set(n.id, 0);
  for (const e of edges) {
    if (degree.has(e.source)) degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
    if (degree.has(e.target)) degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
  }
  const alive = new Set<string>();
  for (const n of nodes) if ((degree.get(n.id) ?? 0) > 0) alive.add(n.id);
  return {
    nodes: nodes.filter((n) => alive.has(n.id)),
    edges: edges.filter((e) => alive.has(e.source) && alive.has(e.target)),
  };
}

/** Connected components via union-find over nodes/edges. */
export function detectClusters(
  nodes: GraphNode[],
  edges: GraphEdge[],
): { clusters: { id: string; size: number }[]; isolated: number } {
  const parent = new Map<string, string>();
  for (const n of nodes) parent.set(n.id, n.id);
  const find = (x: string): string => {
    if (parent.get(x) !== x) parent.set(x, find(parent.get(x)!));
    return parent.get(x)!;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(rb, ra);
  };
  const incident = new Set<string>();
  for (const e of edges) {
    if (parent.has(e.source) && parent.has(e.target)) {
      union(e.source, e.target);
      incident.add(e.source);
      incident.add(e.target);
    } else {
      if (parent.has(e.source)) incident.add(e.source);
      if (parent.has(e.target)) incident.add(e.target);
    }
  }
  const size = new Map<string, number>();
  for (const n of nodes) {
    const root = find(n.id);
    size.set(root, (size.get(root) ?? 0) + 1);
  }
  const clusters = Array.from(size.entries())
    .map(([id, sz]) => ({ id, size: sz }))
    .sort((a, b) => b.size - a.size);
  let isolated = 0;
  for (const n of nodes) if (!incident.has(n.id)) isolated++;
  return { clusters, isolated };
}

const csvCell = (v: unknown): string => {
  const s = v == null ? "" : String(v);
  return `"${s.replace(/"/g, '""')}"`;
};

export function buildCsvNodes(nodes: GraphNode[]): string {
  const rows = [
    "id,kind,type,label,importance,weight,confidence,createdAt",
  ];
  for (const n of nodes) {
    rows.push(
      [
        csvCell(n.id),
        csvCell(n.kind),
        csvCell(n.type),
        csvCell(n.label),
        String(n.importance),
        n.weight.toFixed(4),
        n.confidence != null ? String(n.confidence) : "",
        csvCell(n.createdAt),
      ].join(","),
    );
  }
  return rows.join("\n") + "\n";
}

export function buildCsvEdges(edges: GraphEdge[]): string {
  const rows = ["id,source,target,type,directed,strength,confidence,createdAt"];
  for (const e of edges) {
    rows.push(
      [
        csvCell(e.id),
        csvCell(e.source),
        csvCell(e.target),
        csvCell(e.type),
        e.directed ? "true" : "false",
        e.strength.toFixed(4),
        e.confidence != null ? String(e.confidence) : "",
        csvCell(e.createdAt),
      ].join(","),
    );
  }
  return rows.join("\n") + "\n";
}

export function buildJsonExport(projection: GraphProjection): string {
  return JSON.stringify(projection, null, 2);
}

// ---------------------------------------------------------------------------
// Data loads
// ---------------------------------------------------------------------------

async function loadEntities(
  userId: string,
  workspaceId: string,
  nodeTypes?: string[],
): Promise<PgRow[]> {
  const types = nodeTypes && nodeTypes.length ? nodeTypes : null;
  const sql = `
    SELECT id, entity_type AS "type", canonical_name AS label, confidence,
           created_at AS "createdAt", updated_at AS "updatedAt"
    FROM entities
    WHERE workspace_id = $1
      ${types ? "AND entity_type = ANY($2)" : ""}
    ORDER BY confidence DESC NULLS LAST
    LIMIT 4000
  `;
  const params: unknown[] = [workspaceId];
  if (types) params.push(types);
  return queryTenant(userId, sql, params as string[]);
}

async function loadMemories(
  userId: string,
  workspaceId: string,
  opts: {
    nodeTypes?: string[];
    minImportance?: number;
    from?: string;
    to?: string;
    topic?: string;
  },
): Promise<PgRow[]> {
  const clauses: string[] = ["workspace_id = $1", "state = 'active'"];
  const params: unknown[] = [workspaceId];
  const add = (v: unknown) => {
    params.push(v);
    return params.length;
  };
  if (opts.nodeTypes && opts.nodeTypes.length) {
    clauses.push(`memory_type = ANY($${add(opts.nodeTypes)})`);
  }
  if (opts.minImportance != null) {
    clauses.push(`importance >= $${add(Math.max(0, opts.minImportance))}`);
  }
  if (opts.topic) {
    clauses.push(
      `(content ILIKE $${add(`%${opts.topic}%`)} OR coalesce(summary,'') ILIKE $${add(`%${opts.topic}%`)})`,
    );
  }
  if (opts.from) clauses.push(`created_at >= $${add(opts.from)}`);
  if (opts.to) clauses.push(`created_at <= $${add(opts.to)}`);
  const sql = `
    SELECT id, memory_type AS "type", content, summary, importance, confidence,
           created_at AS "createdAt", updated_at AS "updatedAt",
           occurred_at AS "occurredAt", valid_from AS "validFrom",
           valid_until AS "validUntil"
    FROM memory_records
    WHERE ${clauses.join(" AND ")}
    ORDER BY importance DESC NULLS LAST
    LIMIT 4000
  `;
  return queryTenant(userId, sql, params as string[]);
}

async function loadRelationshipEdges(
  userId: string,
  workspaceId: string,
  memoryIds: string[],
): Promise<GraphEdge[]> {
  if (!memoryIds.length) return [];
  const rows = await queryTenant(
    userId,
    `
      SELECT r.id, r.source_memory_id AS "sourceId", r.target_memory_id AS "targetId",
             r.relationship_type AS "type", r.strength,
             r.created_at AS "createdAt"
      FROM memory_relationships r
      JOIN memory_records ms ON ms.id = r.source_memory_id AND ms.workspace_id = $1
      JOIN memory_records mt ON mt.id = r.target_memory_id AND mt.workspace_id = $1
      WHERE r.source_memory_id = ANY($2) AND r.target_memory_id = ANY($2)
      ORDER BY r.created_at DESC
      LIMIT 6000
    `,
    [workspaceId, memoryIds],
  );
  return rows.map((r) => ({
    id: `rel:${String(r.id)}`,
    source: memoryNodeId(String(r.sourceId)),
    target: memoryNodeId(String(r.targetId)),
    type: String(r.type),
    directed: isDirected(String(r.type)),
    strength: r.strength != null ? Number(r.strength) : 0.5,
    confidence: r.strength != null ? Number(r.strength) : null,
    createdAt: fmtIso(r.createdAt),
  }));
}

async function loadReferenceEdges(
  userId: string,
  workspaceId: string,
  memoryIds: string[],
): Promise<GraphEdge[]> {
  if (!memoryIds.length) return [];
  const rows = await queryTenant(
    userId,
    `
      SELECT me.memory_id AS "sourceId", e.id AS "targetId",
             me.confidence, me.created_at AS "createdAt"
      FROM memory_entities me
      JOIN entities e
        ON e.workspace_id = $1
       AND lower(e.canonical_name) = lower(me.entity_value)
       AND e.entity_type = me.entity_type
      WHERE me.memory_id = ANY($2)
      LIMIT 6000
    `,
    [workspaceId, memoryIds],
  );
  return rows.map((r) => ({
    id: `ref:${String(r.sourceId)}:${String(r.targetId)}`,
    source: memoryNodeId(String(r.sourceId)),
    target: entityNodeId(String(r.targetId)),
    type: "references",
    directed: true,
    strength: r.confidence != null ? Number(r.confidence) : 0.5,
    confidence: r.confidence != null ? Number(r.confidence) : null,
    createdAt: fmtIso(r.createdAt),
  }));
}

// ---------------------------------------------------------------------------
// Projection
// ---------------------------------------------------------------------------

export async function projectGraph(
  opts: GraphProjectOptions,
): Promise<GraphProjection> {
  const { userId, workspaceId } = opts;
  if (!(await userHasWorkspaceAccess(userId, workspaceId))) throw "FORBIDDEN";

  const mode: GraphMode = opts.mode ?? "universe";
  const limitNodes = opts.limitNodes ?? 600;
  const limitEdges = opts.limitEdges ?? 1500;
  const from = opts.from || undefined;
  const to = opts.to || undefined;
  const topic = opts.topic?.trim();
  const minConfidence = opts.minConfidence != null ? clamp01(opts.minConfidence) : 0;

  const [entityRows, memoryRows] = await Promise.all([
    loadEntities(userId, workspaceId, opts.nodeTypes),
    loadMemories(userId, workspaceId, {
      nodeTypes: opts.nodeTypes,
      minImportance: opts.minImportance,
      from,
      to,
      topic: mode === "topic" && topic ? topic : undefined,
    }),
  ]);

  const nodes: GraphNode[] = [];
  const nodeIndex = new Map<string, GraphNode>();
  const memoryIdToNode = new Map<string, GraphNode>();
  const entityIdToNode = new Map<string, GraphNode>();

  for (const r of entityRows) {
    const n = normalizeEntityNode(r);
    nodes.push(n);
    nodeIndex.set(n.id, n);
    entityIdToNode.set(String(r.id), n);
  }
  for (const r of memoryRows) {
    const n = normalizeMemoryNode(r);
    nodes.push(n);
    nodeIndex.set(n.id, n);
    memoryIdToNode.set(String(r.id), n);
  }

  const memoryIds = Array.from(memoryIdToNode.keys());

  const [relEdges, refEdges] = await Promise.all([
    loadRelationshipEdges(userId, workspaceId, memoryIds),
    loadReferenceEdges(userId, workspaceId, memoryIds),
  ]);

  // Apply relationship-type filter to relationship edges (reference edges keep
  // their fixed type unless explicitly excluded).
  let edges = relEdges;
  if (opts.relationshipTypes && opts.relationshipTypes.length) {
    const allowed = new Set(opts.relationshipTypes);
    edges = edges.filter((e) => allowed.has(e.type));
  }
  edges = edges.concat(refEdges);

  // Only keep edges whose endpoints are present.
  edges = edges.filter(
    (e) => nodeIndex.has(e.source) && nodeIndex.has(e.target),
  );

  // Build adjacency for mode expansion.
  const adjacency = new Map<string, Set<string>>();
  const addAdj = (a: string, b: string) => {
    if (!adjacency.has(a)) adjacency.set(a, new Set());
    adjacency.get(a)!.add(b);
  };
  for (const e of edges) {
    addAdj(e.source, e.target);
    addAdj(e.target, e.source);
  }

  // Node selection by mode.
  let keep = new Set<string>();
  const keepAll = () => {
    for (const n of nodes) keep.add(n.id);
  };

  const expand = (start: Set<string>, depth: number) => {
    let frontier = start;
    const current = new Set(frontier);
    for (let d = 0; d < depth; d++) {
      const next = new Set<string>();
      for (const id of frontier) {
        for (const nb of adjacency.get(id) ?? []) {
          if (!current.has(nb)) {
            current.add(nb);
            next.add(nb);
          }
        }
      }
      frontier = next;
      if (!frontier.size) break;
    }
    keep = current;
  };

  if (mode === "project") {
    const focus = opts.projectId ? entityIdToNode.get(opts.projectId) : undefined;
    if (focus) expand(new Set([focus.id]), 2);
  } else if (mode === "person") {
    const focus =
      opts.focusId && opts.focusKind !== "memory"
        ? entityIdToNode.get(opts.focusId)
        : undefined;
    if (focus) expand(new Set([focus.id]), 2);
  } else if (mode === "focus") {
    if (opts.focusId) {
      const focus = nodeIndex.get(
        opts.focusKind === "memory"
          ? memoryNodeId(opts.focusId)
          : entityNodeId(opts.focusId),
      );
      if (focus) expand(new Set([focus.id]), 1);
    }
  } else if (mode === "topic") {
    const matched = nodes.filter((n) => n.kind === "memory" && n.weight > 0);
    // Topic-matched nodes are already filtered in SQL; expand one hop to
    // surface related entities.
    expand(new Set(matched.map((n) => n.id)), 1);
  } else {
    keepAll();
  }

  let keptNodes = nodes.filter((n) => keep.has(n.id));
  let keptEdges = edges.filter((e) => keep.has(e.source) && keep.has(e.target));

  // Confidence filter on edges.
  if (minConfidence > 0) {
    keptEdges = keptEdges.filter((e) => e.strength >= minConfidence);
  }

  // Sort nodes by weight desc for deterministic truncation.
  keptNodes.sort((a, b) => b.weight - a.weight);

  let truncatedNodes = false;
  if (keptNodes.length > limitNodes) {
    keptNodes = keptNodes.slice(0, limitNodes);
    truncatedNodes = true;
  }
  const keptIds = new Set(keptNodes.map((n) => n.id));
  keptEdges = keptEdges.filter(
    (e) => keptIds.has(e.source) && keptIds.has(e.target),
  );

  let truncatedEdges = false;
  const sortedEdges = [...keptEdges].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
  if (sortedEdges.length > limitEdges) {
    keptEdges = sortedEdges.slice(0, limitEdges);
    truncatedEdges = true;
  } else {
    keptEdges = sortedEdges;
  }

  if (opts.hideDisconnected) {
    const pruned = dropDisconnectedNodes(keptNodes, keptEdges);
    keptNodes = pruned.nodes;
    keptEdges = pruned.edges;
  }

  return {
    nodes: keptNodes,
    edges: keptEdges,
    truncated: { nodes: truncatedNodes, edges: truncatedEdges },
  };
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

export async function getGraphMetrics(
  userId: string,
  workspaceId: string,
): Promise<GraphMetrics> {
  if (!(await userHasWorkspaceAccess(userId, workspaceId))) throw "FORBIDDEN";

  const [totalEntities, totalMemories, totalRels, entityCats, memoryTypes, growthRows, recentRows] =
    await Promise.all([
      queryTenant(
        userId,
        `SELECT count(*)::int AS c FROM entities WHERE workspace_id = $1`,
        [workspaceId],
      ),
      queryTenant(
        userId,
        `SELECT count(*)::int AS c FROM memory_records WHERE workspace_id = $1 AND state = 'active'`,
        [workspaceId],
      ),
      queryTenant(
        userId,
        `SELECT count(*)::int AS c
           FROM memory_relationships r
           JOIN memory_records ms ON ms.id = r.source_memory_id AND ms.workspace_id = $1
           JOIN memory_records mt ON mt.id = r.target_memory_id AND mt.workspace_id = $1`,
        [workspaceId],
      ),
      queryTenant(
        userId,
        `SELECT entity_type AS "type", count(*)::int AS count
           FROM entities WHERE workspace_id = $1 GROUP BY entity_type ORDER BY count DESC`,
        [workspaceId],
      ),
      queryTenant(
        userId,
        `SELECT memory_type AS "type", count(*)::int AS count
           FROM memory_records WHERE workspace_id = $1 AND state = 'active'
           GROUP BY memory_type ORDER BY count DESC`,
        [workspaceId],
      ),
      queryTenant(
        userId,
        `SELECT to_char(date_trunc('month', g), 'YYYY-MM') AS month, count(*)::int AS "nodes"
           FROM (
             SELECT created_at AS g FROM entities WHERE workspace_id = $1
             UNION ALL
             SELECT created_at AS g FROM memory_records WHERE workspace_id = $1 AND state = 'active'
           ) t
           GROUP BY 1 ORDER BY 1`,
        [workspaceId],
      ),
      queryTenant(
        userId,
        `SELECT r.id, r.source_memory_id AS "sourceId", r.target_memory_id AS "targetId",
                r.relationship_type AS "type", r.created_at AS "createdAt"
           FROM memory_relationships r
           JOIN memory_records ms ON ms.id = r.source_memory_id AND ms.workspace_id = $1
           JOIN memory_records mt ON mt.id = r.target_memory_id AND mt.workspace_id = $1
           ORDER BY r.created_at DESC LIMIT 15`,
        [workspaceId],
      ),
    ]);

  return {
    totalEntities: totalEntities[0]?.c ?? 0,
    totalActiveMemories: totalMemories[0]?.c ?? 0,
    totalRelationships: totalRels[0]?.c ?? 0,
    entityCategoryCounts: entityCats.map((r) => ({
      type: String(r.type),
      count: Number(r.count),
    })),
    memoryTypeCounts: memoryTypes.map((r) => ({
      type: String(r.type),
      count: Number(r.count),
    })),
    growth: growthRows.map((r) => ({
      month: String(r.month),
      nodes: Number(r.nodes),
    })),
    recentEdges: recentRows.map((r) => ({
      id: String(r.id),
      source: memoryNodeId(String(r.sourceId)),
      target: memoryNodeId(String(r.targetId)),
      type: String(r.type),
      createdAt: fmtIso(r.createdAt),
    })),
  };
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export async function searchGraph(
  userId: string,
  workspaceId: string,
  q: string,
  opts?: { limit?: number },
): Promise<GraphNode[]> {
  if (!(await userHasWorkspaceAccess(userId, workspaceId))) throw "FORBIDDEN";
  const term = q.trim();
  if (!term) return [];
  const limit = opts?.limit ?? 20;
  const pattern = `%${term}%`;

  const [entityRows, memoryRows] = await Promise.all([
    queryTenant(
      userId,
      `
        SELECT id, entity_type AS "type", canonical_name AS label, confidence,
               created_at AS "createdAt", updated_at AS "updatedAt"
        FROM entities
        WHERE workspace_id = $1 AND lower(canonical_name) ILIKE $2
        ORDER BY confidence DESC NULLS LAST
        LIMIT $3
      `,
      [workspaceId, pattern, limit],
    ),
    queryTenant(
      userId,
      `
        SELECT id, memory_type AS "type", content, summary, importance, confidence,
               created_at AS "createdAt", updated_at AS "updatedAt",
               occurred_at AS "occurredAt", valid_from AS "validFrom",
               valid_until AS "validUntil"
        FROM memory_records
        WHERE workspace_id = $1 AND state = 'active'
          AND (content ILIKE $2 OR coalesce(summary,'') ILIKE $2)
        ORDER BY importance DESC NULLS LAST
        LIMIT $3
      `,
      [workspaceId, pattern, limit],
    ),
  ]);

  const result: GraphNode[] = [];
  for (const r of entityRows) result.push(normalizeEntityNode(r));
  for (const r of memoryRows) result.push(normalizeMemoryNode(r));
  result.sort((a, b) => b.weight - a.weight);
  return result.slice(0, limit);
}

// ---------------------------------------------------------------------------
// Snapshots
// ---------------------------------------------------------------------------

const SNAPSHOT_SELECT = `
  id, workspace_id AS "workspaceId", owner_id AS "ownerId", name, mode,
  node_ids AS "nodeIds", edge_ids AS "edgeIds", filter,
  created_at AS "createdAt", updated_at AS "updatedAt"
`;

function mapSnapshotRow(row: PgRow): GraphSnapshotRecord {
  return {
    id: String(row.id),
    workspaceId: String(row.workspaceId),
    ownerId: String(row.ownerId),
    name: String(row.name),
    mode: String(row.mode),
    nodeIds: (row.nodeIds as unknown as string[]) ?? [],
    edgeIds: (row.edgeIds as unknown as string[]) ?? [],
    filter: (row.filter as Record<string, unknown>) ?? {},
    createdAt: fmtIso(row.createdAt),
    updatedAt: fmtIso(row.updatedAt),
  };
}

export async function createSnapshot(
  userId: string,
  workspaceId: string,
  input: GraphSnapshotInput,
): Promise<GraphSnapshotRecord> {
  if (!(await userHasWorkspaceAccess(userId, workspaceId))) throw "FORBIDDEN";
  const rows = await queryTenant(
    userId,
    `
      INSERT INTO graph_snapshots (workspace_id, owner_id, name, mode, node_ids, edge_ids, filter)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING ${SNAPSHOT_SELECT}
    `,
    [
      workspaceId,
      userId,
      input.name.slice(0, 200),
      input.mode,
      input.nodeIds.map(String),
      input.edgeIds.map(String),
      input.filter ?? {},
    ],
  );
  if (!rows[0]) throw "SNAPSHOT_CREATE_FAILED";
  return mapSnapshotRow(rows[0]);
}

export async function listSnapshots(
  userId: string,
  workspaceId: string,
): Promise<GraphSnapshotRecord[]> {
  if (!(await userHasWorkspaceAccess(userId, workspaceId))) throw "FORBIDDEN";
  const rows = await queryTenant(
    userId,
    `SELECT ${SNAPSHOT_SELECT} FROM graph_snapshots WHERE workspace_id = $1 ORDER BY created_at DESC`,
    [workspaceId],
  );
  return rows.map(mapSnapshotRow);
}

export async function deleteSnapshot(
  userId: string,
  workspaceId: string,
  id: string,
): Promise<void> {
  if (!(await userHasWorkspaceAccess(userId, workspaceId))) throw "FORBIDDEN";
  await queryTenant(
    userId,
    `DELETE FROM graph_snapshots WHERE id = $1 AND workspace_id = $2`,
    [id, workspaceId],
  );
}
