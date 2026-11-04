"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentSession } from "@/server/auth/session";
import { recordAuditEvent } from "@/server/data/audit";
import { ingestText, runProcessingPass } from "@/server/memory/service";
import { getIngestion } from "@/server/memory/ingestion";
import {
  archiveMemory,
  purgeMemory,
  resolveReview,
  retryProcessing,
  softDeleteMemory,
  unarchiveMemory,
} from "@/server/memory/lifecycle";
import { updateMemory } from "@/server/memory/storage";
import { MEMORY_TYPES } from "@/server/memory/constants";

export interface ActionResult {
  ok: boolean;
  error?: string;
  id?: string;
}

function unpackError(e: unknown): string {
  if (e instanceof Error && e.message === "FORBIDDEN") {
    return "You don't have access to this workspace.";
  }
  if (e instanceof Error && e.message) {
    return e.message;
  }
  return "Something went wrong. Please try again.";
}

const ingestSchema = z.object({
  workspaceId: z.string().uuid(),
  sourceType: z.enum(["text", "note", "markdown", "txt", "conversation", "api"]),
  sourceId: z.string().max(300).optional(),
  title: z.string().max(300).optional(),
  content: z.string().min(1).max(500_000),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const updateMemorySchema = z.object({
  memoryId: z.string().uuid(),
  content: z.string().min(1).max(5_000).optional(),
  summary: z.string().max(1_000).nullable().optional(),
  memoryType: z.enum(MEMORY_TYPES).optional(),
  confidence: z.number().min(0).max(1).nullable().optional(),
  changeReason: z.string().max(200).optional(),
});

export async function ingestMemoryAction(input: z.infer<typeof ingestSchema>): Promise<ActionResult> {
  const session = await getCurrentSession();
  if (!session) return { ok: false, error: "You are not signed in." };
  const parsed = ingestSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  try {
    const record = await ingestText(session.id, parsed.data);
    await recordAuditEvent({
      actorId: session.id,
      action: "ingest.create",
      entityType: "ingestion_record",
      entityId: record.id,
      workspaceId: record.workspaceId,
    });
    revalidatePath("/app/processing");
    return { ok: true, id: record.id };
  } catch (e) {
    return { ok: false, error: unpackError(e) };
  }
}

export async function updateMemoryAction(input: z.infer<typeof updateMemorySchema>): Promise<ActionResult> {
  const session = await getCurrentSession();
  if (!session) return { ok: false, error: "You are not signed in." };
  const parsed = updateMemorySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid memory." };
  }
  try {
    const updated = await updateMemory(session.id, parsed.data.memoryId, {
      content: parsed.data.content,
      summary: parsed.data.summary,
      memoryType: parsed.data.memoryType,
      confidence: parsed.data.confidence,
      changeReason: parsed.data.changeReason ?? "user_edit",
    });
    if (!updated) return { ok: false, error: "Memory not found." };
    await recordAuditEvent({
      actorId: session.id,
      action: "memory.update",
      entityType: "memory_record",
      entityId: updated.id,
      workspaceId: updated.workspaceId,
    });
    revalidatePath(`/app/vault/${updated.id}`);
    return { ok: true, id: updated.id };
  } catch (e) {
    return { ok: false, error: unpackError(e) };
  }
}

export async function archiveMemoryAction(memoryId: string): Promise<ActionResult> {
  const session = await getCurrentSession();
  if (!session) return { ok: false, error: "You are not signed in." };
  try {
    const mem = await archiveMemory(session.id, memoryId);
    if (!mem) return { ok: false, error: "Memory not found." };
    await recordAuditEvent({
      actorId: session.id,
      action: "memory.archive",
      entityType: "memory_record",
      entityId: mem.id,
      workspaceId: mem.workspaceId,
    });
    revalidatePath(`/app/vault/${memoryId}`);
    return { ok: true, id: mem.id };
  } catch (e) {
    return { ok: false, error: unpackError(e) };
  }
}

export async function unarchiveMemoryAction(memoryId: string): Promise<ActionResult> {
  const session = await getCurrentSession();
  if (!session) return { ok: false, error: "You are not signed in." };
  try {
    const mem = await unarchiveMemory(session.id, memoryId);
    if (!mem) return { ok: false, error: "Memory not found." };
    await recordAuditEvent({
      actorId: session.id,
      action: "memory.unarchive",
      entityType: "memory_record",
      entityId: mem.id,
      workspaceId: mem.workspaceId,
    });
    revalidatePath(`/app/vault/${memoryId}`);
    return { ok: true, id: mem.id };
  } catch (e) {
    return { ok: false, error: unpackError(e) };
  }
}

export async function deleteMemoryAction(memoryId: string, permanent = false): Promise<ActionResult> {
  const session = await getCurrentSession();
  if (!session) return { ok: false, error: "You are not signed in." };
  try {
    const mem = await (permanent ? purgeMemory(session.id, memoryId) : (async () => {
      const m = await softDeleteMemory(session.id, memoryId);
      return m ? true : false;
    })());
    if (!mem) return { ok: false, error: "Memory not found." };
    await recordAuditEvent({
      actorId: session.id,
      action: permanent ? "memory.delete_permanent" : "memory.delete",
      entityType: "memory_record",
      entityId: memoryId,
    });
    revalidatePath("/app/vault");
    return { ok: true, id: memoryId };
  } catch (e) {
    return { ok: false, error: unpackError(e) };
  }
}

export async function reviewMemoryAction(memoryId: string, approve: boolean): Promise<ActionResult> {
  const session = await getCurrentSession();
  if (!session) return { ok: false, error: "You are not signed in." };
  try {
    const mem = await resolveReview(session.id, memoryId, approve);
    if (!mem) return { ok: false, error: "Memory not found." };
    await recordAuditEvent({
      actorId: session.id,
      action: "memory.review",
      entityType: "memory_record",
      entityId: mem.id,
      workspaceId: mem.workspaceId,
      metadata: { approve },
    });
    revalidatePath(`/app/vault/${memoryId}`);
    return { ok: true, id: mem.id };
  } catch (e) {
    return { ok: false, error: unpackError(e) };
  }
}

export async function retryJobAction(jobId: string): Promise<ActionResult> {
  const session = await getCurrentSession();
  if (!session) return { ok: false, error: "You are not signed in." };
  try {
    await retryProcessing(session.id, jobId);
    const res = await runProcessingPass();
    await recordAuditEvent({
      actorId: session.id,
      action: "processing.retry",
      entityType: "processing_job",
      entityId: jobId,
      metadata: { processed: res },
    });
    revalidatePath("/app/processing");
    return { ok: true, id: jobId };
  } catch (e) {
    return { ok: false, error: unpackError(e) };
  }
}

export async function runProcessingNowAction(): Promise<ActionResult> {
  const session = await getCurrentSession();
  if (!session) return { ok: false, error: "You are not signed in." };
  try {
    const processed = await runProcessingPass();
    await recordAuditEvent({
      actorId: session.id,
      action: "processing.run",
      metadata: { processed },
    });
    revalidatePath("/app/processing");
    return { ok: true, id: String(processed) };
  } catch (e) {
    return { ok: false, error: unpackError(e) };
  }
}

export async function getIngestionStatusAction(ingestionId: string): Promise<{ ok: boolean; status?: string; error?: string }> {
  const session = await getCurrentSession();
  if (!session) return { ok: false, error: "You are not signed in." };
  try {
    const record = await getIngestion(session.id, ingestionId);
    if (!record) return { ok: false, error: "Ingestion not found." };
    return { ok: true, status: record.status, error: record.error ?? undefined };
  } catch {
    return { ok: false, error: "Could not read ingestion." };
  }
}
