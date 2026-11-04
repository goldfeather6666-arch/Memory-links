/**
 * Demo reset: delete ONLY the demo workspace (cascades to everything owned by
 * it) and never touch personal workspaces or records.
 */
import { queryTenant } from "@/db/client";

export async function resetDemoWorkspace(
  userId: string,
): Promise<{ workspaceId: string | null; deletedWorkspaces: number }> {
  const rows = await queryTenant<{ id: string }>(
    userId,
    `SELECT id FROM workspaces
     WHERE owner_id = $1
       AND settings->>'is_demo' = 'true'`,
    [userId],
  );
  const toDelete = rows.map((r) => r.id);
  for (const id of toDelete) {
    await queryTenant(
      userId,
      `DELETE FROM workspaces WHERE id = $1 AND owner_id = $2`,
      [id, userId],
    );
  }
  return { workspaceId: toDelete[0] ?? null, deletedWorkspaces: toDelete.length };
}
