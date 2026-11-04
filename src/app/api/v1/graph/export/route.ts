import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/server/auth/session";
import { listWorkspacesForUser } from "@/server/data/workspaces";
import { recordAuditEvent } from "@/server/data/audit";
import {
  projectGraph,
  buildJsonExport,
  buildCsvNodes,
  buildCsvEdges,
} from "@/server/intelligence/graph";

// Graph export endpoint.
export const dynamic = "force-dynamic";

const FORMATS = ["json", "nodes-csv", "edges-csv"] as const;
type Format = (typeof FORMATS)[number];

/**
 * GET /api/v1/graph/export?ws=<workspaceId>&format=json|nodes-csv|edges-csv
 * Exports a generous bounded snapshot of the workspace knowledge graph.
 */
export async function GET(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const formatRaw = sp.get("format") ?? "json";
  const format = (FORMATS as readonly string[]).includes(formatRaw) ? (formatRaw as Format) : null;
  if (!format) {
    return NextResponse.json({ error: "Unknown format" }, { status: 400 });
  }

  const workspaces = await listWorkspacesForUser(session.id);
  if (workspaces.length === 0) {
    return NextResponse.json({ error: "No workspace" }, { status: 404 });
  }

  const requested = sp.get("ws");
  const selected = workspaces.find((w) => w.workspace.id === requested) ?? workspaces[0];
  const workspaceId = selected.workspace.id;

  try {
    const projection = await projectGraph({
      userId: session.id,
      workspaceId,
      limitNodes: 5000,
      limitEdges: 10000,
    });

    await recordAuditEvent({
      actorId: session.id,
      action: "graph_export",
      entityType: "graph",
      workspaceId,
      metadata: { format },
    });

    if (format === "json") {
      return new NextResponse(buildJsonExport(projection), {
        headers: {
          "Content-Type": "application/json",
          "Content-Disposition": 'attachment; filename="graph.json"',
        },
      });
    }

    if (format === "nodes-csv") {
      return new NextResponse(buildCsvNodes(projection.nodes), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="graph-nodes.csv"',
        },
      });
    }

    return new NextResponse(buildCsvEdges(projection.edges), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="graph-edges.csv"',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
