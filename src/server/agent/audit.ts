import { queryTenant } from "@/db/client";

export interface AgentAuditInput {
  userId: string;
  agentId?: string | null;
  workspaceId: string;
  action: string;
  metadata?: Record<string, unknown>;
}

export async function recordAgentAudit(input: AgentAuditInput): Promise<void> {
  await queryTenant(
    input.userId,
    `INSERT INTO agent_audit_events (agent_id, actor_id, workspace_id, action, metadata)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      input.agentId ?? null,
      input.userId,
      input.workspaceId,
      input.action,
      JSON.stringify(input.metadata ?? {}),
    ],
  ).catch(() => undefined);
}

export interface AuditEventRow {
  id: string;
  agentId: string | null;
  action: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export async function listAgentAudit(
  userId: string,
  opts: { workspaceId: string; agentId?: string; limit?: number; offset?: number },
): Promise<AuditEventRow[]> {
  const limit = Math.min(opts.limit ?? 50, 200);
  const offset = opts.offset ?? 0;
  const rows = await queryTenant<Record<string, unknown>>(
    userId,
    `SELECT id, agent_id, action, metadata, created_at
       FROM agent_audit_events
      WHERE workspace_id = $1 ${opts.agentId ? "AND agent_id = $4" : ""}
      ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
    opts.agentId
      ? [opts.workspaceId, limit, offset, opts.agentId]
      : [opts.workspaceId, limit, offset],
  );
  return rows.map((r) => ({
    id: String(r.id),
    agentId: r.agent_id ? String(r.agent_id) : null,
    action: String(r.action),
    metadata: (r.metadata as Record<string, unknown>) ?? {},
    createdAt: new Date(String(r.created_at)).toISOString(),
  }));
}
