import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/server/auth/session";
import { listWorkspacesForUser } from "@/server/data/workspaces";
import { listSnapshots, createSnapshot } from "@/server/intelligence/graph";

// Graph snapshots endpoint.
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/graph/snapshots?ws=<workspaceId>
 * Lists saved knowledge graph snapshots for the workspace.
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
    const snapshots = await listSnapshots(session.id, workspaceId);
    return NextResponse.json({ snapshots });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/v1/graph/snapshots?ws=<workspaceId>
 * Body: { name?, mode?, nodeIds?, edgeIds?, filter? }
 * Creates a knowledge graph snapshot. Returns 201.
 */
export async function POST(req: NextRequest) {
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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const b = (body ?? {}) as Record<string, unknown>;
    const nodeIds = Array.isArray(b.nodeIds) ? (b.nodeIds as unknown[]).map(String) : [];
    const edgeIds = Array.isArray(b.edgeIds) ? (b.edgeIds as unknown[]).map(String) : [];
    const filter = (typeof b.filter === "object" && b.filter !== null
      ? b.filter
      : {}) as Record<string, unknown>;

    const snapshot = await createSnapshot(session.id, workspaceId, {
      name: String(b.name ?? "Snapshot"),
      mode: String(b.mode ?? "universe"),
      nodeIds,
      edgeIds,
      filter,
    });

    return NextResponse.json(snapshot, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
