import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/server/auth/session";
import { listWorkspacesForUser } from "@/server/data/workspaces";
import { queryTenant } from "@/db/client";

/**
 * GET /api/v1/integrations/:id/sources?ws=<workspaceId>&type=<recordType>
 * Returns the sources discovered for a connection, optionally filtered by
 * record type.
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

  const typeFilter = req.nextUrl.searchParams.get("type");
  const sql = typeFilter
    ? `SELECT id, record_type AS "recordType", title, url, status,
              source_timestamp AS "sourceTimestamp", modified_at AS "modifiedAt",
              last_ingestion_id AS "lastIngestionId", created_at AS "createdAt"
         FROM connection_sources
        WHERE workspace_id = $1 AND connection_id = $2 AND record_type = $3
        ORDER BY created_at DESC
        LIMIT 50`
    : `SELECT id, record_type AS "recordType", title, url, status,
              source_timestamp AS "sourceTimestamp", modified_at AS "modifiedAt",
              last_ingestion_id AS "lastIngestionId", created_at AS "createdAt"
         FROM connection_sources
        WHERE workspace_id = $1 AND connection_id = $2
        ORDER BY created_at DESC
        LIMIT 50`;
  const values = typeFilter ? [workspaceId, id, typeFilter] : [workspaceId, id];

  try {
    const sources = await queryTenant(session.id, sql, values);
    return NextResponse.json({ sources });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
