import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/server/auth/session";
import { listWorkspacesForUser } from "@/server/data/workspaces";
import { runSync } from "@/server/connectors/sync";

/**
 * POST /api/v1/integrations/:id/sync?ws=<workspaceId>
 * Triggers a manual sync. Returns { result: SyncResult } on success, or 409
 * when the connection is not in a connected state.
 */
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
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
    const result = await runSync(session.id, workspaceId, id, "manual");
    return NextResponse.json({ result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (message === "NOT_CONNECTED" || message.toLowerCase().includes("not connected")) {
      return NextResponse.json({ error: "Not connected" }, { status: 409 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
