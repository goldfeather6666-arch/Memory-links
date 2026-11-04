import { queryTenant } from "@/db/client";
import type { PermissionSet, Scope } from "./types";

export async function readPermissionSet(
  userId: string,
  agentId: string,
  workspaceId: string,
): Promise<PermissionSet | null> {
  const rows = await queryTenant<Record<string, unknown>>(
    userId,
    `SELECT agent_id, workspace_id, scopes, memory_types, project_ids, read_only
       FROM agent_workspace_permissions
      WHERE agent_id = $1 AND workspace_id = $2`,
    [agentId, workspaceId],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    agentId: String(r.agent_id),
    workspaceId: String(r.workspace_id),
    scopes: (r.scopes as Scope[]) ?? [],
    memoryTypes: (r.memory_types as string[]) ?? [],
    projectIds: (r.project_ids as string[]) ?? [],
    readOnly: Boolean(r.read_only),
  };
}

export async function listPermissionSets(
  userId: string,
  agentId: string,
): Promise<PermissionSet[]> {
  const rows = await queryTenant<Record<string, unknown>>(
    userId,
    `SELECT agent_id, workspace_id, scopes, memory_types, project_ids, read_only
       FROM agent_workspace_permissions
      WHERE agent_id = $1 ORDER BY created_at`,
    [agentId],
  );
  return rows.map((r) => ({
    agentId: String(r.agent_id),
    workspaceId: String(r.workspace_id),
    scopes: (r.scopes as Scope[]) ?? [],
    memoryTypes: (r.memory_types as string[]) ?? [],
    projectIds: (r.project_ids as string[]) ?? [],
    readOnly: Boolean(r.read_only),
  }));
}

export function hasScope(perms: PermissionSet | null, scope: Scope): boolean {
  return Boolean(perms && perms.scopes.includes(scope));
}

export function memoryTypeAllowed(perms: PermissionSet | null, type?: string): boolean {
  if (!perms) return false;
  if (type && perms.memoryTypes.length > 0 && !perms.memoryTypes.includes(type)) return false;
  return true;
}

export function projectAllowed(perms: PermissionSet | null, projectId?: string): boolean {
  if (!perms) return false;
  if (projectId && perms.projectIds.length > 0 && !perms.projectIds.includes(projectId)) return false;
  return true;
}

export function canReadMemory(perms: PermissionSet | null, type?: string): boolean {
  return hasScope(perms, "read:memory") && memoryTypeAllowed(perms, type);
}

export function canReadGraph(perms: PermissionSet | null): boolean {
  return hasScope(perms, "read:graph");
}

export function canReadProject(perms: PermissionSet | null): boolean {
  return hasScope(perms, "read:project");
}

export function canReadInsights(perms: PermissionSet | null): boolean {
  return hasScope(perms, "read:insights");
}

export function canReadUsage(perms: PermissionSet | null): boolean {
  return hasScope(perms, "read:usage");
}

export function canAdmin(perms: PermissionSet | null): boolean {
  return hasScope(perms, "admin:manage");
}

export function canPropose(perms: PermissionSet | null): boolean {
  return Boolean(
    perms && !perms.readOnly && (hasScope(perms, "propose:memory") || hasScope(perms, "write:memory")),
  );
}

export function canWriteMemory(perms: PermissionSet | null): boolean {
  return Boolean(perms && !perms.readOnly && hasScope(perms, "write:memory"));
}

export function canUpdateMemory(perms: PermissionSet | null): boolean {
  return Boolean(perms && !perms.readOnly && hasScope(perms, "update:memory"));
}

export function canLinkMemory(perms: PermissionSet | null): boolean {
  return Boolean(perms && !perms.readOnly && hasScope(perms, "link:memory"));
}

export function canArchiveMemory(perms: PermissionSet | null): boolean {
  return Boolean(perms && !perms.readOnly && hasScope(perms, "archive:memory"));
}

export function canDeleteMemory(perms: PermissionSet | null): boolean {
  return Boolean(perms && !perms.readOnly && hasScope(perms, "delete:memory"));
}
