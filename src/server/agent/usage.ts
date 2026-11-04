import { queryTenant } from "@/db/client";
import { getServerEnv } from "@/lib/env";

export interface UsageRow {
  operation: string;
  count: number;
  bytes: number;
  day: string;
}

export async function recordAgentUse(
  userId: string,
  args: { agentId: string; workspaceId: string; operation: string; bytes?: number },
): Promise<void> {
  await queryTenant(
    userId,
    `INSERT INTO agent_usage (agent_id, workspace_id, operation, count, bytes, day)
     VALUES ($1, $2, $3, 1, $4, CURRENT_DATE)
     ON CONFLICT (agent_id, workspace_id, day, operation)
     DO UPDATE SET count = agent_usage.count + 1, bytes = agent_usage.bytes + EXCLUDED.bytes`,
    [args.agentId, args.workspaceId, args.operation, args.bytes ?? 0],
  );
}

export async function checkAndRecordRateLimit(
  userId: string,
  args: { agentId: string; workspaceId: string },
): Promise<{ allowed: boolean; current: number; limit: number }> {
  const limit = getServerEnv().AGENT_API_RATE_LIMIT;
  const rows = await queryTenant<Record<string, unknown>>(
    userId,
    `INSERT INTO agent_usage (agent_id, workspace_id, operation, count, bytes, day)
     VALUES ($1, $2, 'api_request', 1, 0, CURRENT_DATE)
     ON CONFLICT (agent_id, workspace_id, day, operation)
     DO UPDATE SET count = agent_usage.count + 1
     RETURNING count`,
    [args.agentId, args.workspaceId],
  );
  const current = Number(rows[0]?.count ?? 1);
  return { allowed: current <= limit, current, limit };
}

export async function getAgentUsage(
  userId: string,
  agentId: string,
  days = 30,
): Promise<UsageRow[]> {
  const rows = await queryTenant<Record<string, unknown>>(
    userId,
    `SELECT operation, sum(count)::int AS count, sum(bytes)::int AS bytes, day
       FROM agent_usage
      WHERE agent_id = $1 AND day >= CURRENT_DATE - ($2::int)
      GROUP BY operation, day ORDER BY day DESC, operation`,
    [agentId, days],
  );
  return rows.map((r) => ({
    operation: String(r.operation),
    count: Number(r.count),
    bytes: Number(r.bytes),
    day: String(r.day),
  }));
}

export async function getWorkspaceUsage(
  userId: string,
  workspaceId: string,
  days = 30,
): Promise<UsageRow[]> {
  const rows = await queryTenant<Record<string, unknown>>(
    userId,
    `SELECT operation, sum(count)::int AS count, sum(bytes)::int AS bytes, day
       FROM agent_usage
      WHERE workspace_id = $1 AND day >= CURRENT_DATE - ($2::int)
      GROUP BY operation, day ORDER BY day DESC, operation`,
    [workspaceId, days],
  );
  return rows.map((r) => ({
    operation: String(r.operation),
    count: Number(r.count),
    bytes: Number(r.bytes),
    day: String(r.day),
  }));
}
