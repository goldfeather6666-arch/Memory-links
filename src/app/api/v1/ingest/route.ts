import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/server/auth/session";
import { ingestText } from "@/server/memory/service";
import { recordAuditEvent } from "@/server/data/audit";

const ingestSchema = z.object({
  workspaceId: z.string().uuid(),
  sourceType: z.enum(["text", "note", "markdown", "txt", "conversation", "api"]),
  sourceId: z.string().max(300).optional(),
  title: z.string().max(300).optional(),
  content: z.string().min(1).max(500_000),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = ingestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }
  try {
    const record = await ingestText(session.id, parsed.data);
    await recordAuditEvent({
      actorId: session.id,
      action: "api.ingest.create",
      entityType: "ingestion_record",
      entityId: record.id,
      workspaceId: record.workspaceId,
    });
    return NextResponse.json({ id: record.id, status: record.status }, { status: 201 });
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : "Internal error" }, { status: 500 });
  }
}
