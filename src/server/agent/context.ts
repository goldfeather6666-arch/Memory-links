import { queryTenant } from "@/db/client";
import { getServerEnv } from "@/lib/env";
import { projectGraph, type GraphNode } from "@/server/intelligence/graph";
import { recallMemories } from "@/server/memory/retrieval";
import type { AgentPrincipal } from "./types";
import { readPermissionSet } from "./permissions";
import { canReadGraph, canReadProject } from "./permissions";
import { recordAgentAudit } from "./audit";

export interface ContextPackage {
  workspaceId: string;
  agentId: string;
  project: { id: string; name: string; description: string | null; status: string } | null;
  summary: string;
  memories: {
    id: string;
    content: string;
    summary: string | null;
    type: string;
    confidence: number | null;
    importance: number;
    validFrom: string | null;
    validUntil: string | null;
    occurredAt: string | null;
    sourceRef: string | null;
    relevance: number | null;
  }[];
  entities: { id: string; label: string; type: string; confidence: number | null }[];
  preferences: { id: string; content: string; summary: string | null }[];
  timeline: { id: string; content: string; occurredAt: string }[];
  sources: { kind: string; id: string; label: string }[];
  retrievedAt: string;
}

export async function buildContextPackage(
  principal: AgentPrincipal,
  opts: { projectId?: string; task?: string; maxMemories?: number },
): Promise<ContextPackage> {
  const perms = await readPermissionSet(principal.userId, principal.agentId, principal.workspaceId);
  const cap = Math.min(
    getServerEnv().AGENT_CONTEXT_MAX_MEMORIES ?? 40,
    Math.max(1, opts.maxMemories ?? 40),
  );

  // Project metadata (only if the agent can read projects).
  let project: ContextPackage["project"] = null;
  if (opts.projectId && canReadProject(perms)) {
    const rows = await queryTenant<Record<string, unknown>>(
      principal.userId,
      `SELECT id, name, description, status FROM projects WHERE id = $1 AND workspace_id = $2`,
      [opts.projectId, principal.workspaceId],
    );
    const r = rows[0];
    if (r) {
      project = {
        id: String(r.id),
        name: String(r.name),
        description: r.description ? String(r.description) : null,
        status: String(r.status),
      };
    }
  }

  // Hybrid retrieval for the question/task.
  const recall = await recallMemories(principal.userId, {
    workspaceId: principal.workspaceId,
    query: opts.task,
    limit: cap,
  });
  const memories = recall.items.map((it) => ({
    id: String(it.id),
    content: String(it.content ?? ""),
    summary: it.summary ? String(it.summary) : null,
    type: String(it.memoryType ?? "episodic"),
    confidence: it.confidence != null ? Number(it.confidence) : null,
    importance: Number(it.importance ?? 0),
    validFrom: it.validFrom ? String(it.validFrom) : null,
    validUntil: it.validUntil ? String(it.validUntil) : null,
    occurredAt: it.validFrom ? String(it.validFrom) : String(it.createdAt),
    sourceRef: it.sourceRef ? String(it.sourceRef) : null,
    relevance: it.relevance != null ? Number(it.relevance) : null,
  }));

  // Entities / graph neighborhood (only if permitted).
  let entities: ContextPackage["entities"] = [];
  if (canReadGraph(perms)) {
    try {
      const graph = await projectGraph({
        userId: principal.userId,
        workspaceId: principal.workspaceId,
        mode: opts.projectId ? "project" : "universe",
        projectId: opts.projectId,
        limitNodes: 60,
        limitEdges: 160,
      });
      const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
      entities = nodes.slice(0, 60).map((n: GraphNode) => ({
        id: n.id,
        label: n.label,
        type: n.type,
        confidence: n.confidence,
      }));
    } catch {
      entities = [];
    }
  }

  // Preferences: semantic memories within the (bounded) recall set.
  const preferences = memories
    .filter((m) => m.type === "semantic" || m.type === "preference")
    .slice(0, 10)
    .map((m) => ({ id: m.id, content: m.content, summary: m.summary }));

  // Timeline: memory records ordered chronologically within the recall set.
  const timeline = [...memories]
    .filter((m) => m.occurredAt)
    .sort((a, b) => (a.occurredAt! < b.occurredAt! ? -1 : 1))
    .slice(0, 20)
    .map((m) => ({ id: m.id, content: m.content, occurredAt: m.occurredAt! }));

  const summary =
    memories
      .filter((m) => m.summary)
      .slice(0, 8)
      .map((m) => m.summary)
      .join(" ") || memories.map((m) => m.content).join(" ").slice(0, 1200);

  const sources = memories.slice(0, 20).map((m) => ({
    kind: "memory",
    id: m.id,
    label: m.summary || m.content.slice(0, 120),
  }));

  await recordAgentAudit({
    userId: principal.userId,
    agentId: principal.agentId,
    workspaceId: principal.workspaceId,
    action: "agent.context.package",
    metadata: { projectId: opts.projectId ?? null, memories: memories.length, task: opts.task?.slice(0, 200) ?? null },
  });

  return {
    workspaceId: principal.workspaceId,
    agentId: principal.agentId,
    project,
    summary,
    memories,
    entities,
    preferences,
    timeline,
    sources,
    retrievedAt: new Date().toISOString(),
  };
}

export async function projectHistory(
  principal: AgentPrincipal,
  projectId: string,
  limit = 20,
): Promise<{ id: string; content: string; occurredAt: string | null; updatedAt: string }[]> {
  const rows = await queryTenant<Record<string, unknown>>(
    principal.userId,
    `SELECT id, content, occurred_at, updated_at
       FROM memory_records
      WHERE workspace_id = $1 AND state = 'active'
        AND metadata @> $2::jsonb
      ORDER BY updated_at DESC LIMIT $3`,
    [
      principal.workspaceId,
      JSON.stringify({ projectId }),
      Math.min(limit, 100),
    ],
  );
  return rows.map((r) => ({
    id: String(r.id),
    content: String(r.content),
    occurredAt: r.occurred_at ? String(r.occurred_at) : null,
    updatedAt: String(r.updated_at),
  }));
}
