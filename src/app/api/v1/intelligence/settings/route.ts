import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/server/auth/session";
import { listWorkspacesForUser } from "@/server/data/workspaces";
import { getProcessingSettings, saveProcessingSettings } from "@/server/intelligence/settings";
import { SaveProcessingSettingsInput } from "@/server/intelligence/types";

function pickWorkspace(req: NextRequest, workspaces: { workspace: { id: string } }[]) {
  const requested = req.nextUrl.searchParams.get("ws");
  return workspaces.find((w) => w.workspace.id === requested) ?? workspaces[0];
}

async function resolveContext(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const workspaces = await listWorkspacesForUser(session.id);
  if (workspaces.length === 0) return { error: NextResponse.json({ error: "No workspace" }, { status: 404 }) };
  const selected = pickWorkspace(req, workspaces);
  return { session, workspaceId: selected.workspace.id };
}

/** GET /api/v1/intelligence/settings?ws=… */
export async function GET(req: NextRequest) {
  const ctx = await resolveContext(req);
  if (ctx.error) return ctx.error;
  try {
    const settings = await getProcessingSettings(ctx.session!.id, ctx.workspaceId!);
    return NextResponse.json(settings);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "FORBIDDEN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** PATCH /api/v1/intelligence/settings?ws=… */
export async function PATCH(req: NextRequest) {
  const ctx = await resolveContext(req);
  if (ctx.error) return ctx.error;
  try {
    const body = (await req.json()) as SaveProcessingSettingsInput;
    const settings = await saveProcessingSettings(ctx.session!.id, ctx.workspaceId!, body);
    return NextResponse.json(settings);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "FORBIDDEN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
