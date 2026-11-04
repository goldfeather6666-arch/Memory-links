import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/server/auth/session";
import { listWorkspacesForUser } from "@/server/data/workspaces";
import { listConnectors, isProviderConfigured } from "@/server/connectors/registry";
import { listConnections } from "@/server/connectors/connections";

/**
 * GET /api/v1/integrations/config?ws=<workspaceId>
 * Returns the connector catalog with availability and connected counts. The
 * frontend depends on this exact shape.
 */
export const dynamic = "force-dynamic";

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
    const all = await listConnectors();
    const conns = await listConnections(session.id, workspaceId);
    const connectors = all.map((c) => ({
      provider: c.provider,
      name: c.name,
      category: c.category,
      description: c.description,
      available: isProviderConfigured(c.provider),
      capabilities: {
        oauth: c.capabilities?.oauth ?? false,
        webhooks: c.capabilities?.webhooks ?? false,
        incremental: c.capabilities?.incremental ?? false,
        historicalImport: c.capabilities?.historicalImport ?? false,
        selectiveSync: c.capabilities?.selectiveSync ?? false,
        deletionDetection: c.capabilities?.deletionDetection ?? false,
      },
      connected: conns.filter((x) => x.provider === c.provider).length,
    }));
    return NextResponse.json({ connectors });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
