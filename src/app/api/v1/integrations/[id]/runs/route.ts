import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/server/auth/session";
import { listWorkspacesForUser } from "@/server/data/workspaces";
import { queryTenant } from "@/db/client";

/**
 * GET /api/v1/integrations/:id/runs?ws=<workspaceId>
 * Returns the sync run history for a connection, newest first.
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workspaces = await listWorkspacesForUser(session.id);
  if (workspaces.length === 0) {
    return NextResponse.json({ error: "No workspace" }, { status: 404 });
  }
  const requested = req.nextUrl.searchParams.get("ws");
  const selected = workspaces.find((w) => w.workspace.id === requested) ?? workspaces[0];
  const workspaceId = selected.workspace.id;

  try {
    const runs = await queryTenant(
      session.id,
      `SELECT id, status, trigger,
              records_discovered AS "recordsDiscovered",
              records_imported AS "recordsImported",
              records_updated AS "recordsUpdated",
              records_skipped AS "recordsSkipped",
              records_failed AS "recordsFailed",
              error, started_at AS "startedAt", finished_at AS "finishedAt",
              created_at AS "createdAt"
         FROM sync_runs
        WHERE workspace_id = $1 AND connection_id = $2
        ORDER BY created_at DESC
        LIMIT 50`,
      [workspaceId, id],
    );
    return NextResponse.json({ runs });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
