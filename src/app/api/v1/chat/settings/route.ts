import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/server/auth/session";
import { listWorkspacesForUser } from "@/server/data/workspaces";
import { getChatSettings, saveChatSettings } from "@/server/conversations/settings";
import { getChatUsage } from "@/server/chat/cost";
import { listProviderKeys } from "@/server/chat/byok";
import { byokEnabled } from "@/server/chat/byok";

function resolveWorkspace(req: NextRequest, workspaces: { workspace: { id: string } }[]) {
  const requested = req.nextUrl.searchParams.get("ws");
  return workspaces.find((w) => w.workspace.id === requested) ?? workspaces[0];
}

export async function GET(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const workspaces = await listWorkspacesForUser(session.id);
  if (workspaces.length === 0) return NextResponse.json({ error: "No workspace" }, { status: 404 });
  const workspaceId = resolveWorkspace(req, workspaces).workspace.id;
  try {
    const [settings, usage, keys, byok] = await Promise.all([
      getChatSettings(session.id, workspaceId),
      getChatUsage(session.id, workspaceId),
      listProviderKeys(session.id, workspaceId),
      byokEnabled(),
    ]);
    return NextResponse.json({ settings, usage, keys, byokEnabled: byok });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "FORBIDDEN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const workspaces = await listWorkspacesForUser(session.id);
  if (workspaces.length === 0) return NextResponse.json({ error: "No workspace" }, { status: 404 });
  const workspaceId = resolveWorkspace(req, workspaces).workspace.id;
  let body: {
    automaticMemoryCapture?: boolean;
    modelPreference?: string | null;
    budgetCapTokens?: number;
    allowStreaming?: boolean;
  } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  try {
    const settings = await saveChatSettings(session.id, workspaceId, body);
    return NextResponse.json(settings);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "FORBIDDEN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
