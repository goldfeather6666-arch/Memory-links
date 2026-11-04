import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/server/auth/session";
import { listMemories } from "@/server/memory/storage";
import { recallMemories } from "@/server/memory/retrieval";
import { MEMORY_TYPES } from "@/server/memory/constants";

function parseTypeList(value: string | null): string[] | undefined {
  if (!value) return undefined;
  const parts = value.split(",").map((s) => s.trim()).filter(Boolean);
  return parts.filter((p) => (MEMORY_TYPES as readonly string[]).includes(p));
}

export async function GET(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const sp = req.nextUrl.searchParams;
  const workspaceId = sp.get("workspaceId");
  const q = sp.get("q")?.trim();
  const type = sp.get("type");
  const state = sp.get("state");
  const limit = Math.min(Number(sp.get("limit") ?? 20) || 20, 100);
  const offset = Math.max(Number(sp.get("offset") ?? 0) || 0, 0);

  if (!workspaceId) {
    return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
  }
  const types = parseTypeList(type);
  const states = state ? [state] : undefined;

  try {
    if (q) {
      const result = await recallMemories(session.id, {
        workspaceId,
        query: q,
        memoryTypes: types as never[] | undefined,
        states: states as never[] | undefined,
        limit,
        offset,
      });
      return NextResponse.json(result);
    }
    const result = await listMemories(session.id, workspaceId, {
      memoryTypes: types as never[] | undefined,
      states: states as never[] | undefined,
      limit,
      offset,
    });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
