import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/server/auth/session";
import { listWorkspacesForUser } from "@/server/data/workspaces";
import { projectGraph, type GraphMode } from "@/server/intelligence/graph";

// Knowledge graph projection endpoint.
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/graph?ws=<workspaceId>&mode=<mode>&projectId=<id>
 *     &focusId=<id>&focusKind=<kind>&topic=<topic>
 *     &nodeTypes=<comma,list>&relationshipTypes=<comma,list>
 *     &minImportance=<n>&minConfidence=<n>
 *     &from=<iso>&to=<iso>&hideDisconnected=true
 *     &limitNodes=<n>&limitEdges=<n>
 * Returns a knowledge graph projection for the workspace.
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

  const sp = req.nextUrl.searchParams;
  const requested = sp.get("ws");
  const selected = workspaces.find((w) => w.workspace.id === requested) ?? workspaces[0];
  const workspaceId = selected.workspace.id;

  try {
    const mode = sp.get("mode");
    const projectId = sp.get("projectId");
    const focusId = sp.get("focusId");
    const focusKindRaw = sp.get("focusKind");
    const focusKind =
      focusKindRaw === "memory" || focusKindRaw === "entity" ? focusKindRaw : undefined;
    const topic = sp.get("topic");
    const nodeTypesRaw = sp.get("nodeTypes");
    const relationshipTypesRaw = sp.get("relationshipTypes");
    const minImportanceRaw = sp.get("minImportance");
    const minConfidenceRaw = sp.get("minConfidence");
    const from = sp.get("from");
    const to = sp.get("to");
    const hideDisconnected = sp.get("hideDisconnected") === "true";
    const limitNodesRaw = sp.get("limitNodes");
    const limitEdgesRaw = sp.get("limitEdges");

    const nodeTypes = nodeTypesRaw ? nodeTypesRaw.split(",").map((s) => s.trim()).filter(Boolean) : undefined;
    const relationshipTypes = relationshipTypesRaw
      ? relationshipTypesRaw.split(",").map((s) => s.trim()).filter(Boolean)
      : undefined;
    const minImportance = minImportanceRaw != null && minImportanceRaw !== "" ? Number(minImportanceRaw) : undefined;
    const minConfidence = minConfidenceRaw != null && minConfidenceRaw !== "" ? Number(minConfidenceRaw) : undefined;
    const limitNodes = limitNodesRaw != null && limitNodesRaw !== "" ? Number(limitNodesRaw) : undefined;
    const limitEdges = limitEdgesRaw != null && limitEdgesRaw !== "" ? Number(limitEdgesRaw) : undefined;

    const modeTyped = (mode as GraphMode) ?? undefined;
    const parsed = {
      ...(modeTyped ? { mode: modeTyped } : {}),
      ...(projectId ? { projectId } : {}),
      ...(focusId ? { focusId } : {}),
      ...(focusKind ? { focusKind } : {}),
      ...(topic ? { topic } : {}),
      ...(nodeTypes && nodeTypes.length > 0 ? { nodeTypes } : {}),
      ...(relationshipTypes && relationshipTypes.length > 0 ? { relationshipTypes } : {}),
      ...(minImportance !== undefined && !Number.isNaN(minImportance) ? { minImportance } : {}),
      ...(minConfidence !== undefined && !Number.isNaN(minConfidence) ? { minConfidence } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      ...(hideDisconnected ? { hideDisconnected: true } : {}),
      ...(limitNodes !== undefined && !Number.isNaN(limitNodes) ? { limitNodes } : {}),
      ...(limitEdges !== undefined && !Number.isNaN(limitEdges) ? { limitEdges } : {}),
    };

    const projection = await projectGraph({ userId: session.id, workspaceId, ...parsed });
    return NextResponse.json(projection);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
