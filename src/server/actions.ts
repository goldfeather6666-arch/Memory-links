"use server";

import { revalidatePath } from "next/cache";
import { getCurrentSession } from "@/server/auth/session";
import { createWorkspace } from "@/server/data/workspaces";
import { createProject } from "@/server/data/projects";
import { createMemoryRecord } from "@/server/data/memory";
import { recordAuditEvent } from "@/server/data/audit";
import {
  workspaceSchema,
  projectSchema,
  memoryRecordSchema,
} from "@/server/validation/schemas";

export interface ActionResult {
  ok: boolean;
  error?: string;
  id?: string;
}

function unpackError(e: unknown): string {
  if (e instanceof Error && e.message === "FORBIDDEN") {
    return "You don't have access to this workspace.";
  }
  const msg = e instanceof Error ? e.message : "";
  const connHints =
    /ECONNREFUSED|ENETUNREACH|ETIMEDOUT|connection refused|timeout|terminated|pipeline|cannot reach|self-signed|agent\(/i;
  if (connHints.test(msg)) {
    return "The database is unreachable right now. Please try again in a moment.";
  }
  return "Something went wrong. Please try again.";
}

export async function createWorkspaceAction(input: {
  name: string;
  description?: string;
}): Promise<ActionResult> {
  const session = await getCurrentSession();
  if (!session) return { ok: false, error: "You are not signed in." };

  const parsed = workspaceSchema.safeParse({
    name: input.name,
    description: input.description?.trim() ? input.description : null,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid workspace." };
  }

  try {
    const ws = await createWorkspace(
      session.id,
      parsed.data.name,
      parsed.data.description ?? null,
      parsed.data.settings ?? null,
    );
    await recordAuditEvent({
      actorId: session.id,
      action: "workspace.create",
      entityType: "workspace",
      entityId: ws.id,
      workspaceId: ws.id,
    });
    revalidatePath("/app");
    return { ok: true, id: ws.id };
  } catch (e) {
    return { ok: false, error: unpackError(e) };
  }
}

export async function createProjectAction(input: {
  workspaceId: string;
  name: string;
  description?: string;
}): Promise<ActionResult> {
  const session = await getCurrentSession();
  if (!session) return { ok: false, error: "You are not signed in." };

  const parsed = projectSchema.safeParse({
    workspaceId: input.workspaceId,
    name: input.name,
    description: input.description?.trim() ? input.description : null,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid project." };
  }

  try {
    const project = await createProject(
      session.id,
      parsed.data.workspaceId,
      parsed.data.name,
      parsed.data.description ?? null,
      parsed.data.status,
      parsed.data.metadata ?? null,
    );
    await recordAuditEvent({
      actorId: session.id,
      action: "project.create",
      entityType: "project",
      entityId: project.id,
      workspaceId: project.workspaceId,
    });
    revalidatePath("/app/projects");
    return { ok: true, id: project.id };
  } catch (e) {
    return { ok: false, error: unpackError(e) };
  }
}

export async function createMemoryAction(input: {
  workspaceId: string;
  memoryType: "episodic" | "semantic" | "procedural" | "associative";
  content: string;
  summary?: string;
}): Promise<ActionResult> {
  const session = await getCurrentSession();
  if (!session) return { ok: false, error: "You are not signed in." };

  const parsed = memoryRecordSchema.safeParse({
    workspaceId: input.workspaceId,
    memoryType: input.memoryType,
    content: input.content,
    summary: input.summary?.trim() ? input.summary : null,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid memory." };
  }

  try {
    const record = await createMemoryRecord(session.id, {
      ...parsed.data,
      metadata: parsed.data.metadata ?? undefined,
    });
    await recordAuditEvent({
      actorId: session.id,
      action: "memory.create",
      entityType: "memory_record",
      entityId: record.id,
      workspaceId: record.workspaceId,
    });
    revalidatePath("/app/vault");
    return { ok: true, id: record.id };
  } catch (e) {
    return { ok: false, error: unpackError(e) };
  }
}
