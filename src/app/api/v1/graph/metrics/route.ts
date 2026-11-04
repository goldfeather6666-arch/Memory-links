import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/server/auth/session";
import { listWorkspacesForUser } from "@/server/data/workspaces";
import { getGraphMetrics } from "@/server/intelligence/graph";

// Graph metrics endpoint.
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/graph/metrics?ws=<workspaceId>
 * Returns aggregate metrics for the workspace knowledge graph.
 */
export async function GET(req: NextRequest) {
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
    const data = await getGraphMetrics(session.id, workspaceId);
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
