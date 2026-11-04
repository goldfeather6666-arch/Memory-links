import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/server/auth/session";
import { listWorkspacesForUser } from "@/server/data/workspaces";
import { listContradictions, resolveContradiction } from "@/server/intelligence/contradictions";

export async function resolveContext(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const workspaces = await listWorkspacesForUser(session.id);
  if (workspaces.length === 0) return { error: NextResponse.json({ error: "No workspace" }, { status: 404 }) };
  const requested = req.nextUrl.searchParams.get("ws");
  const selected = workspaces.find((w) => w.workspace.id === requested) ?? workspaces[0];
  return { session, workspaceId: selected.workspace.id };
}

/** GET /api/v1/intelligence/contradictions?ws=…&onlyUnresolved=true */
export async function GET(req: NextRequest) {
  const ctx = await resolveContext(req);
  if (ctx.error) return ctx.error;
  try {
    const onlyUnresolved = req.nextUrl.searchParams.get("onlyUnresolved") === "true";
    const list = await listContradictions(ctx.session!.id, ctx.workspaceId!, { onlyUnresolved });
    return NextResponse.json(list);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "FORBIDDEN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** PATCH /api/v1/intelligence/contradictions/[id] — resolve */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await resolveContext(req);
  if (ctx.error) return ctx.error;
  const { id } = await params;
  try {
    const body = (await req.json()) as { status: string; note?: string };
    const updated = await resolveContradiction(ctx.session!.id, ctx.workspaceId!, id, body.status as never, body.note);
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "FORBIDDEN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
