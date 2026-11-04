import { queryTenant } from "@/db/client";
import { findDuplicate } from "@/server/memory/duplication";
import { getMemory, insertMemoryFromFact, updateMemory } from "@/server/memory/storage";
import { archiveMemory, softDeleteMemory } from "@/server/memory/lifecycle";
import type { ExtractedFact } from "@/server/memory/types";
import {
  canArchiveMemory,
  canDeleteMemory,
  canLinkMemory,
  canPropose,
  canUpdateMemory,
  canWriteMemory,
  readPermissionSet,
} from "./permissions";
import { LinkMemorySchema, MemoryPayloadSchema, UpdateMemorySchema } from "./types";
import type { AgentPrincipal, ContributionRecord } from "./types";
import { recordAgentAudit } from "./audit";
import { emitEvent } from "./webhooks";

export interface ContributionResult {
  status: string;
  contributionId?: string;
  memoryId?: string | null;
  duplicateOf?: string | null;
  error?: string;
}

type ContributionKind = ContributionRecord["kind"];

function mapContribution(row: Record<string, unknown>): ContributionRecord {
  return {
    id: String(row.id),
    agentId: String(row.agent_id),
    workspaceId: String(row.workspace_id),
    ownerId: String(row.owner_id),
    kind: String(row.kind) as ContributionKind,
    payload: (row.payload as Record<string, unknown>) ?? {},
    status: String(row.status),
    memoryId: row.memory_id ? String(row.memory_id) : null,
    sourceName: row.source_name ? String(row.source_name) : null,
    sourceDetail: (row.source_detail as Record<string, unknown> | null) ?? null,
    duplicateOf: row.duplicate_of ? String(row.duplicate_of) : null,
    conflictNote: row.conflict_note ? String(row.conflict_note) : null,
    decisionActor: row.decision_actor ? String(row.decision_actor) : null,
    createdAt: new Date(String(row.created_at)).toISOString(),
    decidedAt: row.decided_at ? new Date(String(row.decided_at)).toISOString() : null,
  };
}

function toFact(payload: Record<string, unknown>): ExtractedFact {
  return {
    memoryType: String(payload.memoryType ?? "episodic") as ExtractedFact["memoryType"],
    content: String(payload.content ?? ""),
    summary: String(payload.summary ?? String(payload.content ?? "").slice(0, 200)),
    confidence: typeof payload.confidence === "number" ? payload.confidence : 0.7,
    validFrom: payload.validFrom ? String(payload.validFrom) : null,
    validUntil: payload.validUntil ? String(payload.validUntil) : null,
    entities: Array.isArray(payload.entities)
      ? (payload.entities as { name: string; type?: string }[])
      : [],
  };
}

async function storePendingContribution(
  principal: AgentPrincipal,
  kind: ContributionKind,
  payload: Record<string, unknown>,
): Promise<string> {
  const rows = await queryTenant<Record<string, unknown>>(
    principal.userId,
    `INSERT INTO agent_contributions (agent_id, workspace_id, owner_id, kind, payload, source_name, source_detail, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending') RETURNING id`,
    [
      principal.agentId,
      principal.workspaceId,
      principal.userId,
      kind,
      JSON.stringify(payload),
      principal.name,
      JSON.stringify({ agentId: principal.agentId, origin: "agent", integrationType: "mcp" }),
    ],
  );
  return String(rows[0].id);
}

async function storeAutoContribution(
  principal: AgentPrincipal,
  kind: ContributionKind,
  payload: Record<string, unknown>,
  memoryId: string | null,
  duplicateOf: string | null,
): Promise<void> {
  await queryTenant(
    principal.userId,
    `INSERT INTO agent_contributions (agent_id, workspace_id, owner_id, kind, payload, source_name, source_detail, status, memory_id, duplicate_of, decided_at, decision_actor)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'auto_approved', $8, $9, now(), $10)`,
    [
      principal.agentId,
      principal.workspaceId,
      principal.userId,
      kind,
      JSON.stringify(payload),
      principal.name,
      JSON.stringify({ agentId: principal.agentId, origin: "agent", integrationType: "mcp" }),
      memoryId,
      duplicateOf,
      principal.agentId,
    ],
  ).catch(() => undefined);
}

async function handleMemoryContribution(
  principal: AgentPrincipal,
  payload: Record<string, unknown>,
): Promise<ContributionResult> {
  const parsed = MemoryPayloadSchema.safeParse(payload);
  if (!parsed.success) return { status: "error", error: "invalid_payload" };
  const perms = await readPermissionSet(principal.userId, principal.agentId, principal.workspaceId);
  if (!canPropose(perms)) return { status: "error", error: "FORBIDDEN" };

  const fact = toFact(parsed.data as unknown as Record<string, unknown>);
  const auto = principal.mode === "autonomous" && canWriteMemory(perms);

  if (!auto) {
    const id = await storePendingContribution(principal, "memory", fact as unknown as Record<string, unknown>);
    await emitEvent("memory.proposed", {
      workspaceId: principal.workspaceId,
      agentId: principal.agentId,
      contributionId: id,
    });
    return { status: "pending", contributionId: id };
  }

  const dup = await findDuplicate(principal.userId, principal.workspaceId, fact);
  if (dup.outcome === "duplicate" && dup.existingMemoryId) {
    await storeAutoContribution(principal, "memory", fact as unknown as Record<string, unknown>, dup.existingMemoryId, dup.existingMemoryId);
    await emitEvent("memory.conflict_detected", {
      workspaceId: principal.workspaceId,
      agentId: principal.agentId,
      memoryId: dup.existingMemoryId,
    });
    return { status: "auto_approved", memoryId: dup.existingMemoryId, duplicateOf: dup.existingMemoryId };
  }
  if (dup.outcome === "update" && dup.existingMemoryId) {
    await updateMemory(principal.userId, dup.existingMemoryId, {
      content: fact.content,
      summary: fact.summary,
      memoryType: fact.memoryType,
      confidence: fact.confidence,
      changeReason: `agent:${principal.agentId}`,
    });
    await storeAutoContribution(principal, "memory", fact as unknown as Record<string, unknown>, dup.existingMemoryId, null);
    await emitEvent("memory.updated", {
      workspaceId: principal.workspaceId,
      agentId: principal.agentId,
      memoryId: dup.existingMemoryId,
    });
    return { status: "auto_approved", memoryId: dup.existingMemoryId };
  }
  const mem = await insertMemoryFromFact(principal.userId, principal.workspaceId, fact, {
    sourceRef: `agent:${principal.agentId}`,
    reason: "agent contribution",
  });
  await storeAutoContribution(principal, "memory", fact as unknown as Record<string, unknown>, mem.id, null);
  await emitEvent("memory.created", {
    workspaceId: principal.workspaceId,
    agentId: principal.agentId,
    memoryId: mem.id,
  });
  return { status: "auto_approved", memoryId: mem.id };
}

async function handleRelationshipContribution(
  principal: AgentPrincipal,
  payload: Record<string, unknown>,
): Promise<ContributionResult> {
  const parsed = LinkMemorySchema.safeParse(payload);
  if (!parsed.success) return { status: "error", error: "invalid_payload" };
  const perms = await readPermissionSet(principal.userId, principal.agentId, principal.workspaceId);
  if (!canLinkMemory(perms)) return { status: "error", error: "FORBIDDEN" };
  const auto = principal.mode === "autonomous";
  if (!auto) {
    const id = await storePendingContribution(principal, "relationship", payload);
    return { status: "pending", contributionId: id };
  }
  await createRelationshipUnderUser(principal.userId, principal.workspaceId, parsed.data);
  await storeAutoContribution(principal, "relationship", payload, null, null);
  return { status: "auto_approved" };
}

async function createRelationshipUnderUser(
  userId: string,
  workspaceId: string,
  d: { sourceMemoryId: string; targetMemoryId: string; relationshipType: string; strength?: number; metadata?: Record<string, unknown> },
): Promise<void> {
  const [src, tgt] = await Promise.all([
    getMemory(userId, d.sourceMemoryId),
    getMemory(userId, d.targetMemoryId),
  ]);
  if (!src || !tgt) throw new Error("NOT_FOUND:memory");
  await queryTenant(
    userId,
    `INSERT INTO memory_relationships (source_memory_id, target_memory_id, relationship_type, strength, metadata)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT DO NOTHING`,
    [
      d.sourceMemoryId,
      d.targetMemoryId,
      d.relationshipType,
      d.strength ?? 0.7,
      JSON.stringify(d.metadata ?? {}),
    ],
  );
}

async function handleUpdateContribution(
  principal: AgentPrincipal,
  payload: Record<string, unknown>,
  memoryId: string,
): Promise<ContributionResult> {
  const parsed = UpdateMemorySchema.safeParse(payload);
  if (!parsed.success) return { status: "error", error: "invalid_payload" };
  const perms = await readPermissionSet(principal.userId, principal.agentId, principal.workspaceId);
  if (!canUpdateMemory(perms)) return { status: "error", error: "FORBIDDEN" };
  const auto = principal.mode === "autonomous";
  if (!auto) {
    const id = await storePendingContribution(principal, "update", { memoryId, ...payload });
    return { status: "pending", contributionId: id };
  }
  await updateMemory(principal.userId, memoryId, {
    content: parsed.data.content,
    summary: parsed.data.summary,
    memoryType: parsed.data.memoryType,
    confidence: parsed.data.confidence,
    changeReason: `agent:${principal.agentId}`,
  });
  await storeAutoContribution(principal, "update", { memoryId, ...payload }, memoryId, null);
  await emitEvent("memory.updated", {
    workspaceId: principal.workspaceId,
    agentId: principal.agentId,
    memoryId,
  });
  return { status: "auto_approved", memoryId };
}

export async function submitContribution(
  principal: AgentPrincipal,
  kind: ContributionKind,
  payload: Record<string, unknown>,
): Promise<ContributionResult> {
  await recordAgentAudit({
    userId: principal.userId,
    agentId: principal.agentId,
    workspaceId: principal.workspaceId,
    action: `agent.contribute.${kind}`,
    metadata: { kind },
  });
  switch (kind) {
    case "memory":
      return handleMemoryContribution(principal, payload);
    case "relationship":
      return handleRelationshipContribution(principal, payload);
    case "update": {
      const memoryId = payload.memoryId ? String(payload.memoryId) : null;
      if (!memoryId) return { status: "error", error: "memoryId required" };
      return handleUpdateContribution(principal, payload, memoryId);
    }
    case "delete": {
      const perms = await readPermissionSet(principal.userId, principal.agentId, principal.workspaceId);
      const memoryId = payload.memoryId ? String(payload.memoryId) : null;
      if (!memoryId) return { status: "error", error: "memoryId required" };
      if (!canDeleteMemory(perms)) return { status: "error", error: "FORBIDDEN" };
      if (principal.mode !== "autonomous") {
        const id = await storePendingContribution(principal, "delete", { memoryId });
        return { status: "pending", contributionId: id };
      }
      await softDeleteMemory(principal.userId, memoryId);
      await storeAutoContribution(principal, "delete", { memoryId }, memoryId, null);
      await emitEvent("memory.archived", {
        workspaceId: principal.workspaceId,
        agentId: principal.agentId,
        memoryId,
      });
      return { status: "auto_approved", memoryId };
    }
    default:
      return { status: "error", error: "unsupported_kind" };
  }
}

export async function archiveContribution(
  principal: AgentPrincipal,
  memoryId: string,
): Promise<ContributionResult> {
  const perms = await readPermissionSet(principal.userId, principal.agentId, principal.workspaceId);
  if (!canArchiveMemory(perms)) return { status: "error", error: "FORBIDDEN" };
  if (principal.mode !== "autonomous") {
    const id = await storePendingContribution(principal, "update", { memoryId, archive: true });
    return { status: "pending", contributionId: id };
  }
  const mem = await archiveMemory(principal.userId, memoryId);
  await storeAutoContribution(principal, "update", { memoryId, archive: true }, memoryId, null);
  await emitEvent("memory.archived", {
    workspaceId: principal.workspaceId,
    agentId: principal.agentId,
    memoryId,
  });
  return { status: "auto_approved", memoryId: mem?.id ?? memoryId };
}

export async function listContributions(
  userId: string,
  opts: { workspaceId: string; agentId?: string; status?: string; limit?: number; offset?: number },
): Promise<{ items: ContributionRecord[]; total: number }> {
  const limit = Math.min(opts.limit ?? 50, 200);
  const offset = opts.offset ?? 0;
  const where: string[] = ["workspace_id = $1"];
  const params: unknown[] = [opts.workspaceId];
  if (opts.agentId) { where.push(`agent_id = $${params.length + 1}`); params.push(opts.agentId); }
  if (opts.status) { where.push(`status = $${params.length + 1}`); params.push(opts.status); }
  const whereSql = where.join(" AND ");
  const rows = await queryTenant<Record<string, unknown>>(
    userId,
    `SELECT * FROM agent_contributions WHERE ${whereSql}
      ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset],
  );
  const totalRows = await queryTenant<Record<string, unknown>>(
    userId,
    `SELECT count(*)::int AS n FROM agent_contributions WHERE ${whereSql}`,
    params,
  );
  return {
    items: rows.map(mapContribution),
    total: Number(totalRows[0]?.n ?? 0),
  };
}

export async function decideContribution(
  userId: string,
  contributionId: string,
  decision: "approved" | "rejected",
  note?: string,
): Promise<ContributionRecord | null> {
  const rows = await queryTenant<Record<string, unknown>>(
    userId,
    `SELECT * FROM agent_contributions WHERE id = $1`,
    [contributionId],
  );
  const row = rows[0];
  if (!row || row.status !== "pending") return row ? mapContribution(row) : null;
  const c = mapContribution(row);

  if (decision === "rejected") {
    await queryTenant(
      userId,
      `UPDATE agent_contributions SET status='rejected', conflict_note=$2, decided_at=now(), decision_actor=$3 WHERE id=$1`,
      [contributionId, note ?? null, userId],
    );
    return mapContribution((await queryTenant<Record<string, unknown>>(userId, `SELECT * FROM agent_contributions WHERE id=$1`, [contributionId]))[0]);
  }

  let memoryId: string | null = null;
  let duplicateOf: string | null = null;

  try {
    if (c.kind === "memory") {
      const parsed = MemoryPayloadSchema.safeParse(c.payload);
      if (!parsed.success) throw new Error("invalid_payload");
      const fact = toFact(parsed.data as unknown as Record<string, unknown>);
      const dup = await findDuplicate(userId, c.workspaceId, fact);
      if (dup.outcome === "duplicate" && dup.existingMemoryId) {
        memoryId = dup.existingMemoryId;
        duplicateOf = dup.existingMemoryId;
      } else if (dup.outcome === "update" && dup.existingMemoryId) {
        memoryId = dup.existingMemoryId;
        await updateMemory(userId, memoryId, { content: fact.content, summary: fact.summary, memoryType: fact.memoryType, confidence: fact.confidence, changeReason: `agent:${c.agentId}` });
      } else {
        const mem = await insertMemoryFromFact(userId, c.workspaceId, fact, {
          sourceRef: `agent:${c.agentId}`,
          reason: "agent contribution approved by user",
        });
        memoryId = mem.id;
      }
    } else if (c.kind === "relationship") {
      const parsed = LinkMemorySchema.safeParse(c.payload);
      if (parsed.success) await createRelationshipUnderUser(userId, c.workspaceId, parsed.data);
    } else if (c.kind === "update") {
      const memId = c.payload.memoryId ? String(c.payload.memoryId) : null;
      if (memId && c.payload.archive === true) {
        const m = await archiveMemory(userId, memId);
        memoryId = m?.id ?? memId;
      } else if (memId) {
        const parsed = UpdateMemorySchema.safeParse(c.payload);
        if (parsed.success) {
          const m = await updateMemory(userId, memId, {
            content: parsed.data.content,
            summary: parsed.data.summary,
            memoryType: parsed.data.memoryType,
            confidence: parsed.data.confidence,
            changeReason: `agent:${c.agentId}`,
          });
          memoryId = m?.id ?? memId;
        }
      }
    } else if (c.kind === "delete") {
      const memId = c.payload.memoryId ? String(c.payload.memoryId) : null;
      if (memId) {
        const m = await softDeleteMemory(userId, memId);
        memoryId = m?.id ?? memId;
      }
    }

    await queryTenant(
      userId,
      `UPDATE agent_contributions SET status='approved', memory_id=$2, duplicate_of=$3, conflict_note=$4, decided_at=now(), decision_actor=$5 WHERE id=$1`,
      [contributionId, memoryId, duplicateOf, note ?? null, userId],
    );
    await emitEvent("memory.approved", {
      workspaceId: c.workspaceId,
      agentId: c.agentId,
      contributionId: c.id,
      memoryId,
    });
  } catch (e) {
    await queryTenant(
      userId,
      `UPDATE agent_contributions SET status='error', conflict_note=$2, decided_at=now(), decision_actor=$3 WHERE id=$1`,
      [contributionId, e instanceof Error ? e.message : "error", userId],
    );
  }

  const updated = await queryTenant<Record<string, unknown>>(userId, `SELECT * FROM agent_contributions WHERE id=$1`, [contributionId]);
  return updated[0] ? mapContribution(updated[0]) : null;
}
