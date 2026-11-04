import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/server/auth/session";
import { listWorkspacesForUser } from "@/server/data/workspaces";
import { PROVIDERS } from "@/server/connectors/registry";
import { buildAuthorizeUrl } from "@/server/connectors/oauth";
import type { ProviderId } from "@/server/connectors/types";

/**
 * POST /api/v1/integrations/:provider/connect?ws=<workspaceId>
 * Starts OAuth for a provider. Body: { redirectTo?: string }.
 * Returns { url } to send the browser to. 409 when the provider is not
 * configured (missing OAuth credentials).
 */
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params;
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

  let redirectTo: string | undefined;
  try {
    const body = (await req.json()) as { redirectTo?: string };
    redirectTo =
      typeof body.redirectTo === "string" && body.redirectTo.trim()
        ? body.redirectTo.trim()
        : undefined;
  } catch {
    // Missing/empty body is acceptable; redirectTo stays undefined.
  }

  const providerId = provider as ProviderId;
  if (!PROVIDERS.some((p) => p.provider === providerId)) {
    return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
  }

  try {
    const url = await buildAuthorizeUrl(session.id, workspaceId, providerId, redirectTo);
    return NextResponse.json({ url });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "NOT_CONFIGURED") {
      return NextResponse.json({ error: "Provider not configured" }, { status: 409 });
    }
    if (message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
