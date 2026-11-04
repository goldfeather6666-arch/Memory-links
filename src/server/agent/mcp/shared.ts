import { queryTenant } from "@/db/client";
import { readPermissionSet } from "../permissions";
import { projectGraph } from "@/server/intelligence/graph";
import type { AgentPrincipal } from "../types";

export function principalFromAuthInfo(authInfo: { extra?: Record<string, unknown> } | undefined): AgentPrincipal | null {
  if (!authInfo?.extra) return null;
  const e = authInfo.extra;
  if (!e.agentId || !e.userId || !e.workspaceId) return null;
  return {
    agentId: String(e.agentId),
    userId: String(e.userId),
    workspaceId: String(e.workspaceId),
    name: e.name ? String(e.name) : "",
    mode: (e.mode as AgentPrincipal["mode"]) ?? "approval",
    category: (e.category as AgentPrincipal["category"]) ?? "custom",
    status: (e.status as AgentPrincipal["status"]) ?? "active",
  };
}

export function loadPerms(principal: AgentPrincipal) {
  return readPermissionSet(principal.userId, principal.agentId, principal.workspaceId);
}

export async function recallTimeline(
  principal: AgentPrincipal,
  from?: string,
  to?: string,
  limit = 100,
): Promise<{ id: string; content: string; occurredAt: string }[]> {
  const params: unknown[] = [principal.workspaceId];
  let sql = `SELECT id, content, occurred_at FROM memory_records
              WHERE workspace_id = $1 AND state='active' AND occurred_at IS NOT NULL`;
  if (from) { params.push(from); sql += ` AND occurred_at >= $${params.length}`; }
  if (to) { params.push(to); sql += ` AND occurred_at <= $${params.length}`; }
  sql += ` ORDER BY occurred_at DESC LIMIT ${Math.min(limit, 200)}`;
  const rows = await queryTenant<Record<string, unknown>>(principal.userId, sql, params);
  return rows.map((r) => ({ id: String(r.id), content: String(r.content), occurredAt: String(r.occurred_at) }));
}

export async function buildInsights(principal: AgentPrincipal): Promise<Record<string, unknown>> {
  let graph;
  try {
    graph = await projectGraph({
      userId: principal.userId,
      workspaceId: principal.workspaceId,
      mode: "universe",
      limitNodes: 400,
      limitEdges: 500,
    });
  } catch {
    graph = { nodes: [], edges: [], truncated: { nodes: false, edges: false } };
  }
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph.edges) ? graph.edges : [];
  const byType: Record<string, number> = {};
  for (const n of nodes) {
    const t = String((n as { type?: unknown }).type ?? "entity");
    byType[t] = (byType[t] ?? 0) + 1;
  }
  return {
    generatedAt: new Date().toISOString(),
    source: "deterministic",
    entityCount: nodes.length,
    relationshipCount: edges.length,
    typeBreakdown: byType,
    truncated: graph.truncated,
  };
}

export async function recentChanges(
  principal: AgentPrincipal,
  limit = 20,
): Promise<{ id: string; content: string; type: string; updatedAt: string }[]> {
  const rows = await queryTenant<Record<string, unknown>>(
    principal.userId,
    `SELECT id, content, memory_type, updated_at FROM memory_records
      WHERE workspace_id = $1 AND state='active'
      ORDER BY updated_at DESC LIMIT $2`,
    [principal.workspaceId, Math.min(limit, 100)],
  );
  return rows.map((r) => ({
    id: String(r.id),
    content: String(r.content),
    type: String(r.memory_type),
    updatedAt: String(r.updated_at),
  }));
}

export async function listAuthorizedProjects(
  principal: AgentPrincipal,
): Promise<{ id: string; name: string; description: string | null; status: string }[]> {
  const rows = await queryTenant<Record<string, unknown>>(
    principal.userId,
    `SELECT id, name, description, status FROM projects WHERE workspace_id = $1 ORDER BY created_at DESC`,
    [principal.workspaceId],
  );
  return rows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
    description: r.description ? String(r.description) : null,
    status: String(r.status),
  }));
}
