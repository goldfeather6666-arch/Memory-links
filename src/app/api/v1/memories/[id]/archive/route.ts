import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/server/auth/session";
import { archiveMemory, unarchiveMemory } from "@/server/memory/lifecycle";
import { recordAuditEvent } from "@/server/data/audit";

const bodySchema = z.object({
  action: z.enum(["archive", "unarchive"]),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Bad action" }, { status: 400 });
  }
  try {
    const mem =
      parsed.data.action === "archive"
        ? await archiveMemory(session.id, id)
        : await unarchiveMemory(session.id, id);
    if (!mem) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    await recordAuditEvent({
      actorId: session.id,
      action: `api.memory.${parsed.data.action}`,
      entityType: "memory_record",
      entityId: mem.id,
      workspaceId: mem.workspaceId,
    });
    return NextResponse.json(mem);
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
