import { queryTenant } from "@/db/client";
import type { Project } from "@/db/schema";
import { userHasWorkspaceAccess } from "@/server/data/workspaces";

export async function createProject(
  userId: string,
  workspaceId: string,
  name: string,
  description: string | null,
  status: Project["status"],
  metadata: Record<string, unknown> | null,
): Promise<Project> {
  if (!(await userHasWorkspaceAccess(userId, workspaceId))) {
    throw new Error("FORBIDDEN");
  }
  const rows = await queryTenant<Project>(
    userId,
    `INSERT INTO projects (workspace_id, name, description, status, metadata)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, workspace_id AS "workspaceId", name, description, status,
               metadata, created_at AS "createdAt", updated_at AS "updatedAt"`,
    [workspaceId, name, description, status, metadata ?? {}],
  );
  return rows[0];
}

export async function listProjectsInWorkspace(
  userId: string,
  workspaceId: string,
): Promise<Project[]> {
  if (!(await userHasWorkspaceAccess(userId, workspaceId))) {
    throw new Error("FORBIDDEN");
  }
  return queryTenant<Project>(
    userId,
    `SELECT id, workspace_id AS "workspaceId", name, description, status,
            metadata, created_at AS "createdAt", updated_at AS "updatedAt"
       FROM projects WHERE workspace_id = $1
       ORDER BY created_at DESC`,
    [workspaceId],
  );
}

export async function listRecentProjectsForUser(
  userId: string,
  limit = 5,
): Promise<Project[]> {
  return queryTenant<Project>(
    userId,
    `SELECT p.id, p.workspace_id AS "workspaceId", p.name, p.description, p.status,
            p.metadata, p.created_at AS "createdAt", p.updated_at AS "updatedAt"
       FROM projects p
       JOIN workspace_members wm ON wm.workspace_id = p.workspace_id
       WHERE wm.user_id = $1
       ORDER BY p.created_at DESC
       LIMIT $2`,
    [userId, limit],
  );
}
