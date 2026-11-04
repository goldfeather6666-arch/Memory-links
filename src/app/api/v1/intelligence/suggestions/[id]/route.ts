import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/server/auth/session";
import { listWorkspacesForUser } from "@/server/data/workspaces";
import { listSuggestions, decideSuggestion } from "@/server/intelligence/suggestions";
import { SUGGESTION_STATUSES } from "@/server/intelligence/types";

async function resolveContext(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const workspaces = await listWorkspacesForUser(session.id);
  if (workspaces.length === 0) return { error: NextResponse.json({ error: "No workspace" }, { status: 404 }) };
  const requested = req.nextUrl.searchParams.get("ws");
  const selected = workspaces.find((w) => w.workspace.id === requested) ?? workspaces[0];
  return { session, workspaceId: selected.workspace.id };
}

/** GET /api/v1/intelligence/suggestions?ws=…&status=pending */
export async function GET(req: NextRequest) {
  const ctx = await resolveContext(req);
  if (ctx.error) return ctx.error;
  try {
    const status = req.nextUrl.searchParams.get("status") ?? undefined;
    const list = await listSuggestions(ctx.session!.id, ctx.workspaceId!, {
      status: status && SUGGESTION_STATUSES.includes(status as never) ? (status as never) : undefined,
      limit: 50,
    });
    return NextResponse.json(list);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "FORBIDDEN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** PATCH /api/v1/intelligence/suggestions/[id] — decide (accept/reject/edit/dismiss/defer) */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await resolveContext(req);
  if (ctx.error) return ctx.error;
  const { id } = await params;
  try {
    const body = (await req.json()) as { action: string; editedBody?: string };
    const updated = await decideSuggestion(
      ctx.session!.id,
      ctx.workspaceId!,
      id,
      body.action as never,
      body.editedBody,
    );
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "FORBIDDEN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
