/**
 * Bounded backfill for existing accounts that do not yet have a demo workspace.
 * Best-effort: provisions each qualifying user in turn and counts successes and
 * failures, so operators can see at a glance what happened.
 */
import { queryRaw } from "@/db/client";
import { ensureDemoWorkspace } from "./seed";

export interface BackfillResult {
  scanned: number;
  created: number;
  failed: number;
}

export async function backfillDemoWorkspaces(opts?: { limit?: number }): Promise<BackfillResult> {
  const limit = opts?.limit ?? 25;
  const rows = await queryRaw<{ id: string }>(
    `SELECT u.id
       FROM users u
       WHERE NOT EXISTS (
         SELECT 1 FROM workspaces w
         WHERE w.owner_id = u.id
           AND w.settings->>'is_demo' = 'true'
       )
       ORDER BY u.created_at
       LIMIT $1`,
    [limit],
  );
  let created = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      await ensureDemoWorkspace(row.id);
      created++;
    } catch {
      failed++;
    }
  }
  return { scanned: rows.length, created, failed };
}
