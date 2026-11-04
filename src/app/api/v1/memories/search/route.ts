import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/server/auth/session";
import { recallMemories } from "@/server/memory/retrieval";

const METHODS = ["keyword", "semantic", "hybrid"] as const;

export async function GET(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const sp = req.nextUrl.searchParams;
  const workspaceId = sp.get("workspaceId");
  const q = sp.get("q")?.trim();
  const methodRaw = sp.get("method");
  const method = (METHODS as readonly string[]).includes(methodRaw ?? "") ? (methodRaw as "keyword" | "semantic" | "hybrid") : undefined;
  const limit = Math.min(Number(sp.get("limit") ?? 20) || 20, 100);
  const offset = Math.max(Number(sp.get("offset") ?? 0) || 0, 0);

  if (!workspaceId || !q) {
    return NextResponse.json({ error: "workspaceId and q are required" }, { status: 400 });
  }

  try {
    const result = await recallMemories(session.id, {
      workspaceId,
      query: q,
      method,
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
