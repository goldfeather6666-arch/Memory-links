import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/server/auth/session";
import { retryProcessing } from "@/server/memory/lifecycle";
import { runProcessingPass } from "@/server/memory/service";
import { recordAuditEvent } from "@/server/data/audit";

const retrySchema = z.object({ jobId: z.string().uuid() });

export async function POST(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = retrySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid jobId" }, { status: 400 });
  }
  try {
    await retryProcessing(session.id, parsed.data.jobId);
    const processed = await runProcessingPass();
    await recordAuditEvent({
      actorId: session.id,
      action: "api.processing.retry",
      entityType: "processing_job",
      entityId: parsed.data.jobId,
      metadata: { processed },
    });
    return NextResponse.json({ ok: true, processed });
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
