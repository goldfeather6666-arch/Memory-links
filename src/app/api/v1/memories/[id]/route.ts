import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/server/auth/session";
import {
  deleteMemoryHard,
  getMemory,
  getMemoryVersions,
  updateMemory,
} from "@/server/memory/storage";
import { listRelatedMemories } from "@/server/memory/relationships";
import { softDeleteMemory } from "@/server/memory/lifecycle";
import { recordAuditEvent } from "@/server/data/audit";

const updateSchema = z.object({
  content: z.string().min(1).max(5_000).optional(),
  summary: z.string().max(1_000).nullable().optional(),
  memoryType: z.enum(["episodic", "semantic", "procedural", "associative"]).optional(),
  confidence: z.number().min(0).max(1).nullable().optional(),
  changeReason: z.string().max(200).optional(),
});

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const memory = await getMemory(session.id, id);
  if (!memory) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const [versions, related] = await Promise.all([
    getMemoryVersions(session.id, id),
    listRelatedMemories(session.id, id),
  ]);
  return NextResponse.json({ memory, versions, related });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  try {
    const updated = await updateMemory(session.id, id, {
      content: parsed.data.content,
      summary: parsed.data.summary,
      memoryType: parsed.data.memoryType,
      confidence: parsed.data.confidence,
      changeReason: parsed.data.changeReason ?? "api_update",
    });
    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    await recordAuditEvent({
      actorId: session.id,
      action: "api.memory.update",
      entityType: "memory_record",
      entityId: updated.id,
      workspaceId: updated.workspaceId,
    });
    return NextResponse.json(updated);
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const permanent = req.nextUrl.searchParams.get("permanent") === "true";
  const memory = await getMemory(session.id, id);
  if (!memory) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (permanent) {
    await deleteMemoryHard(session.id, id);
  } else {
    await softDeleteMemory(session.id, id);
  }
  await recordAuditEvent({
    actorId: session.id,
    action: permanent ? "api.memory.delete_permanent" : "api.memory.delete",
    entityType: "memory_record",
    entityId: id,
    workspaceId: memory.workspaceId,
  });
  return NextResponse.json({ ok: true });
}
