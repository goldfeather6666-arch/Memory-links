import { queryTenant } from "@/db/client";
import type { AuditEvent } from "@/db/schema";

export interface NewAuditEvent {
  actorId?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  workspaceId?: string | null;
  metadata?: Record<string, unknown>;
}

export async function recordAuditEvent(input: NewAuditEvent): Promise<void> {
  try {
    await queryTenant(
      input.actorId ?? null,
      `INSERT INTO audit_events (actor_id, action, entity_type, entity_id, workspace_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        input.actorId ?? null,
        input.action,
        input.entityType ?? null,
        input.entityId ?? null,
        input.workspaceId ?? null,
        input.metadata ?? {},
      ],
    );
  } catch {
    // Audit is best-effort: never break the auth/data flow if the audit store
    // (DATABASE_URL) is unreachable.
  }
}

export async function listAuditEventsForUser(
  userId: string,
  limit = 10,
): Promise<AuditEvent[]> {
  return queryTenant<AuditEvent>(
    userId,
    `SELECT a.id, a.actor_id AS "actorId", a.action,
            a.entity_type AS "entityType", a.entity_id AS "entityId",
            a.workspace_id AS "workspaceId", a.metadata,
            a.created_at AS "createdAt"
       FROM audit_events a
       WHERE a.actor_id = $1 OR a.workspace_id IN (
         SELECT workspace_id FROM workspace_members WHERE user_id = $1
       )
       ORDER BY a.created_at DESC
       LIMIT $2`,
    [userId, limit],
  );
}
