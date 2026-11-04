import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/server/auth/session";
import { listWorkspacesForUser } from "@/server/data/workspaces";
import { queryTenant } from "@/db/client";
import { getConnection, updateConnectionDetails } from "@/server/connectors/connections";

/**
 * GET /api/v1/integrations/:id?ws=<workspaceId> — connection detail + recent
 * runs + sources.
 * PATCH — update { name?, selectedResources?, syncIntervalMin? }.
 */
export const dynamic = "force-dynamic";

interface RunRow {
  id: string;
  status: string;
  trigger: string;
  recordsDiscovered: number;
  recordsImported: number;
  recordsUpdated: number;
  recordsSkipped: number;
  recordsFailed: number;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

interface SourceRow {
  id: string;
  recordType: string;
  title: string | null;
  url: string | null;
  status: string;
  sourceTimestamp: string | null;
  modifiedAt: string | null;
  lastIngestionId: string | null;
  createdAt: string;
}

const RUNS_SQL = `SELECT id, status, trigger,
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
  LIMIT 50`;

const SOURCES_SQL = `SELECT id, record_type AS "recordType", title, url, status,
        source_timestamp AS "sourceTimestamp", modified_at AS "modifiedAt",
        last_ingestion_id AS "lastIngestionId", created_at AS "createdAt"
   FROM connection_sources
  WHERE workspace_id = $1 AND connection_id = $2
  ORDER BY created_at DESC
  LIMIT 50`;

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
    const connection = await getConnection(session.id, workspaceId, id);
    if (!connection) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const runs = await queryTenant<RunRow>(session.id, RUNS_SQL, [workspaceId, id]);
    const sources = await queryTenant<SourceRow>(session.id, SOURCES_SQL, [workspaceId, id]);
    return NextResponse.json({ connection, runs, sources });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
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

  let body: { name?: string; selectedResources?: string[]; syncIntervalMin?: number } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (
    body.syncIntervalMin !== undefined &&
    (!Number.isInteger(body.syncIntervalMin) || body.syncIntervalMin < 1)
  ) {
    return NextResponse.json({ error: "Invalid syncIntervalMin" }, { status: 400 });
  }

  try {
    const connection = await updateConnectionDetails(session.id, workspaceId, id, body);
    if (!connection) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ connection });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
