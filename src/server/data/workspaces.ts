import { queryTenant } from "@/db/client";
import type { Workspace, WorkspaceMember } from "@/db/schema";

export interface WorkspaceWithRole {
  workspace: Workspace;
  role: WorkspaceMember["role"];
}

export async function createWorkspace(
  ownerId: string,
  name: string,
  description: string | null,
  settings: Record<string, unknown> | null,
): Promise<Workspace> {
  const rows = await queryTenant<Workspace>(
    ownerId,
    `WITH ws AS (
       INSERT INTO workspaces (owner_id, name, description, settings)
       VALUES ($1, $2, $3, $4)
       RETURNING id, owner_id AS "ownerId", name, description, settings,
                 created_at AS "createdAt", updated_at AS "updatedAt"
     ), member AS (
       INSERT INTO workspace_members (workspace_id, user_id, role)
       SELECT id, $1, 'owner' FROM ws
     )
     SELECT id, "ownerId", name, description, settings, "createdAt", "updatedAt" FROM ws`,
    [ownerId, name, description, settings ?? {}],
  );
  return rows[0];
}

export async function listWorkspacesForUser(userId: string): Promise<WorkspaceWithRole[]> {
  const rows = await queryTenant<{
    id: string;
    ownerId: string;
    name: string;
    description: string | null;
    settings: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
    role: WorkspaceMember["role"];
  }>(
    userId,
    `SELECT w.id, w.owner_id AS "ownerId", w.name, w.description, w.settings,
            w.created_at AS "createdAt", w.updated_at AS "updatedAt",
            wm.role
       FROM workspaces w
       JOIN workspace_members wm ON wm.workspace_id = w.id
       WHERE wm.user_id = $1
       ORDER BY w.created_at DESC`,
    [userId],
  );
  return rows.map((r) => ({
    workspace: {
      id: r.id,
      ownerId: r.ownerId,
      name: r.name,
      description: r.description,
      settings: r.settings,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    },
    role: r.role,
  }));
}

export async function getWorkspace(
  userId: string,
  workspaceId: string,
): Promise<Workspace | null> {
  const rows = await queryTenant<Workspace>(
    userId,
    `SELECT w.id, w.owner_id AS "ownerId", w.name, w.description, w.settings,
            w.created_at AS "createdAt", w.updated_at AS "updatedAt"
       FROM workspaces w
       JOIN workspace_members wm ON wm.workspace_id = w.id
       WHERE w.id = $1 AND wm.user_id = $2
       LIMIT 1`,
    [workspaceId, userId],
  );
  return rows[0] ?? null;
}

/**
 * Verify a user actually belongs to a workspace. Returns true if the user is
 * an owner or member. Used as the primary authorization gate for all
 * workspace-scoped data operations.
 */
export async function userHasWorkspaceAccess(
  userId: string,
  workspaceId: string,
): Promise<boolean> {
  const rows = await queryTenant<{ ok: boolean }>(
    userId,
    `SELECT EXISTS (
       SELECT 1 FROM workspace_members
       WHERE workspace_id = $1 AND user_id = $2
     ) AS ok`,
    [workspaceId, userId],
  );
  return rows[0]?.ok ?? false;
}
