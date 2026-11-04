import { queryTenant } from "@/db/client";
import { userHasWorkspaceAccess } from "@/server/data/workspaces";
import { issueCredential, revokeAllCredentials } from "./credentials";
import type {
  Agent,
  AgentCategory,
  AgentMode,
  AgentStatus,
  CredentialMetadata,
  RegisterAgentInput,
} from "./types";

const CATEGORY_SET = new Set<string>([
  "coding", "research", "browser", "personal_assistant", "productivity", "creative", "custom",
]);
const MODE_SET = new Set<string>(["read_only", "approval", "autonomous"]);
const STATUS_SET = new Set<string>(["active", "suspended", "revoked"]);
const VALID_SCOPES = new Set<string>([
  "read:memory", "read:entity", "read:graph", "read:project", "read:preferences",
  "read:documents", "read:history", "read:insights", "read:usage", "read:audit",
  "propose:memory", "write:memory", "update:memory", "link:memory", "archive:memory",
  "delete:memory", "write:project", "admin:manage",
]);

export function sanitizeCategory(c?: string): AgentCategory {
  return c && CATEGORY_SET.has(c) ? (c as AgentCategory) : "custom";
}
export function sanitizeMode(m?: string): AgentMode {
  return m && MODE_SET.has(m) ? (m as AgentMode) : "approval";
}
export function sanitizeStatus(s?: string): AgentStatus {
  return s && STATUS_SET.has(s) ? (s as AgentStatus) : "active";
}
export function sanitizeScopes(scopes: string[]): string[] {
  return [...new Set(scopes.filter((s) => VALID_SCOPES.has(s)))];
}

function mapAgent(row: Record<string, unknown>): Agent {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    ownerId: String(row.owner_id),
    name: String(row.name),
    description: row.description ? String(row.description) : null,
    category: sanitizeCategory(String(row.category)),
    integrationType: String(row.integration_type),
    authMethod: String(row.auth_method),
    status: sanitizeStatus(String(row.status)),
    mode: sanitizeMode(String(row.mode)),
    lastActiveAt: row.last_active_at ? new Date(String(row.last_active_at)).toISOString() : null,
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

export async function registerAgent(
  userId: string,
  input: RegisterAgentInput,
): Promise<{ agent: Agent; credential: CredentialMetadata; token: string }> {
  if (!input.name || !input.name.trim()) throw new Error("BAD_REQUEST:name required");
  const workspaceId = input.workspaceId ?? (await defaultWorkspace(userId));
  if (!workspaceId) throw new Error("NO_WORKSPACE");
  if (!(await userHasWorkspaceAccess(userId, workspaceId))) throw new Error("FORBIDDEN");

  const category = sanitizeCategory(input.category);
  const mode = sanitizeMode(input.mode);
  const scopes = sanitizeScopes(input.scopes ?? ["read:memory", "read:project"]);
  const memoryTypes = input.memoryTypes ?? [];
  const projectIds = input.projectIds ?? [];

  const agentRows = await queryTenant<Record<string, unknown>>(
    userId,
    `INSERT INTO agents (workspace_id, owner_id, name, description, category, integration_type, auth_method, status, mode)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', $8) RETURNING *`,
    [
      workspaceId,
      userId,
      input.name.trim(),
      input.description?.trim() ?? null,
      category,
      input.integrationType ?? "mcp",
      "bearer_token",
      mode,
    ],
  );
  const agentId = String(agentRows[0].id);
  const readOnly = mode !== "autonomous";

  await queryTenant(
    userId,
    `INSERT INTO agent_workspace_permissions (agent_id, workspace_id, scopes, memory_types, project_ids, read_only)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [agentId, workspaceId, scopes, memoryTypes, projectIds, readOnly],
  );

  const { credential, token } = await issueCredential(userId, agentId);
  return { agent: mapAgent(agentRows[0]), credential, token };
}

export async function getAgent(userId: string, agentId: string): Promise<Agent | null> {
  const rows = await queryTenant<Record<string, unknown>>(
    userId,
    `SELECT * FROM agents WHERE id = $1`,
    [agentId],
  );
  return rows[0] ? mapAgent(rows[0]) : null;
}

export async function listAgents(userId: string, workspaceId: string): Promise<Agent[]> {
  const rows = await queryTenant<Record<string, unknown>>(
    userId,
    `SELECT * FROM agents WHERE workspace_id = $1 ORDER BY created_at DESC`,
    [workspaceId],
  );
  return rows.map(mapAgent);
}

export async function updateAgent(
  userId: string,
  agentId: string,
  patch: {
    name?: string;
    description?: string | null;
    category?: string;
    mode?: string;
    status?: string;
  },
): Promise<Agent | null> {
  const sets: string[] = [];
  const params: unknown[] = [];
  let idx = 1;
  if (patch.name !== undefined) { sets.push(`name = $${idx++}`); params.push(patch.name.trim()); }
  if (patch.description !== undefined) { sets.push(`description = $${idx++}`); params.push(patch.description?.trim() ?? null); }
  if (patch.category !== undefined) { sets.push(`category = $${idx++}`); params.push(sanitizeCategory(patch.category)); }
  if (patch.mode !== undefined) { sets.push(`mode = $${idx++}`); params.push(sanitizeMode(patch.mode)); }
  if (patch.status !== undefined) { sets.push(`status = $${idx++}`); params.push(sanitizeStatus(patch.status)); }
  if (sets.length === 0) return getAgent(userId, agentId);
  params.push(agentId);
  const rows = await queryTenant<Record<string, unknown>>(
    userId,
    `UPDATE agents SET ${sets.join(", ")}, updated_at = now() WHERE id = $${idx} RETURNING *`,
    params,
  );
  return rows[0] ? mapAgent(rows[0]) : null;
}

export async function revokeAgent(userId: string, agentId: string): Promise<void> {
  await updateAgent(userId, agentId, { status: "revoked" });
  await revokeAllCredentials(userId, agentId);
}

export async function deleteAgent(userId: string, agentId: string): Promise<void> {
  await queryTenant(userId, `DELETE FROM agents WHERE id = $1`, [agentId]);
}

export async function defaultWorkspace(userId: string): Promise<string | null> {
  const rows = await queryTenant<Record<string, unknown>>(
    userId,
    `SELECT workspace_id FROM workspace_members WHERE user_id = $1 ORDER BY joined_at LIMIT 1`,
    [userId],
  );
  return rows[0] ? String(rows[0].workspace_id) : null;
}
