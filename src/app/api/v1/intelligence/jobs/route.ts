import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/server/auth/session";
import { listWorkspacesForUser } from "@/server/data/workspaces";
import { enqueueScheduledAnalysis } from "@/server/intelligence/orchestrator";

/**
 * GET /api/v1/intelligence/jobs?ws=… — list recent intelligence job activity.
 * Returns a lightweight summary from the real job table.
 */
export async function GET(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const workspaces = await listWorkspacesForUser(session.id);
  if (workspaces.length === 0) return NextResponse.json({ error: "No workspace" }, { status: 404 });
  const requested = req.nextUrl.searchParams.get("ws");
  const selected = workspaces.find((w) => w.workspace.id === requested) ?? workspaces[0];

  const rows = await import("@/db/client").then(({ queryTenant }) =>
    queryTenant<Record<string, unknown>>(
      session.id,
      `SELECT id, kind, trigger_type AS "triggerType", state, attempts,
              run_after AS "runAfter", last_error AS "lastError",
              created_at AS "createdAt", updated_at AS "updatedAt"
         FROM intelligence_jobs
        WHERE workspace_id = $1
        ORDER BY created_at DESC
        LIMIT 50`,
      [selected.workspace.id],
    ),
  );
  return NextResponse.json(rows);
}

/**
 * POST /api/v1/intelligence/jobs/trigger?ws=… — enqueue scheduled-style jobs
 * for the current workspace (protected endpoint; respects pause + budget).
 */
export async function POST(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const workspaces = await listWorkspacesForUser(session.id);
  if (workspaces.length === 0) return NextResponse.json({ error: "No workspace" }, { status: 404 });
  const requested = req.nextUrl.searchParams.get("ws");
  const selected = workspaces.find((w) => w.workspace.id === requested) ?? workspaces[0];

  const result = await enqueueScheduledAnalysis(session.id, selected.workspace.id);
  return NextResponse.json(result);
}
