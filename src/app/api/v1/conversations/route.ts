import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/server/auth/session";
import { listWorkspacesForUser } from "@/server/data/workspaces";
import { listConversations, createConversation } from "@/server/conversations/data";

function resolveWorkspace(req: NextRequest, workspaces: { workspace: { id: string } }[]) {
  const requested = req.nextUrl.searchParams.get("ws");
  return workspaces.find((w) => w.workspace.id === requested) ?? workspaces[0];
}

export async function GET(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const workspaces = await listWorkspacesForUser(session.id);
  if (workspaces.length === 0) {
    return NextResponse.json({ error: "No workspace" }, { status: 404 });
  }
  const selected = resolveWorkspace(req, workspaces);
  const workspaceId = selected.workspace.id;
  const sp = req.nextUrl.searchParams;
  const status = sp.get("status") ?? undefined;
  const query = sp.get("q") ?? undefined;
  const limit = Math.min(Number(sp.get("limit") ?? 50) || 50, 200);
  const offset = Math.max(Number(sp.get("offset") ?? 0) || 0, 0);
  try {
    const result = await listConversations(session.id, workspaceId, {
      status: status === "archived" ? "archived" : status ? "active" : undefined,
      query,
      limit,
      offset,
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "FORBIDDEN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const workspaces = await listWorkspacesForUser(session.id);
  if (workspaces.length === 0) {
    return NextResponse.json({ error: "No workspace" }, { status: 404 });
  }
  const selected = resolveWorkspace(req, workspaces);
  const workspaceId = selected.workspace.id;
  let body: { title?: string } = {};
  try {
    body = (await req.json()) as { title?: string };
  } catch {
    // empty body ok
  }
  try {
    const conversation = await createConversation(session.id, { workspaceId, title: body.title });
    return NextResponse.json(conversation, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "FORBIDDEN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
