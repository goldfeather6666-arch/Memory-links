import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/server/auth/session";
import { listWorkspacesForUser } from "@/server/data/workspaces";
import { searchGraph } from "@/server/intelligence/graph";

// Graph search endpoint.
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/graph/search?ws=<workspaceId>&q=<query>&limit=<n>
 * Searches the workspace knowledge graph.
 */
export async function GET(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const q = sp.get("q")?.trim();
  if (!q) {
    return NextResponse.json({ results: [] });
  }

  const workspaces = await listWorkspacesForUser(session.id);
  if (workspaces.length === 0) {
    return NextResponse.json({ error: "No workspace" }, { status: 404 });
  }

  const requested = sp.get("ws");
  const selected = workspaces.find((w) => w.workspace.id === requested) ?? workspaces[0];
  const workspaceId = selected.workspace.id;

  try {
    const limitParam = sp.get("limit") ?? "20";
    const limit = Number(limitParam) || 20;
    const results = await searchGraph(session.id, workspaceId, q, { limit });
    return NextResponse.json({ results });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
