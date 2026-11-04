import { queryTenant } from "@/db/client";
import { userHasWorkspaceAccess } from "@/server/data/workspaces";
import type { EntityRef } from "@/server/memory/types";

/**
 * Associative enrichment: link a memory to other active memories in the same
 * workspace that share an entity (same type + case-insensitive value).
 * Relationships never cross workspace boundaries.
 */
export async function detectAndCreateRelationships(
  userId: string,
  workspaceId: string,
  memoryId: string,
  entities: EntityRef[],
): Promise<number> {
  if (!(await userHasWorkspaceAccess(userId, workspaceId))) {
    throw new Error("FORBIDDEN");
  }
  if (entities.length === 0) return 0;

  let created = 0;
  for (const e of entities) {
    const matches = await queryTenant<{ memoryId: string }>(
      userId,
      `SELECT e.memory_id AS "memoryId"
         FROM memory_entities e
         JOIN memory_records mr ON mr.id = e.memory_id
        WHERE mr.workspace_id = $1 AND mr.state = 'active'
          AND e.memory_id <> $2
          AND e.entity_type = $3
          AND lower(e.entity_value) = lower($4)
        LIMIT 20`,
      [workspaceId, memoryId, e.type, e.value],
    );
    for (const m of matches) {
      const exists = await queryTenant<{ ok: boolean }>(
        userId,
        `SELECT EXISTS (
           SELECT 1 FROM memory_relationships
           WHERE source_memory_id = $1 AND target_memory_id = $2
             AND relationship_type = 'shares_entity'
         ) AS ok`,
        [memoryId, m.memoryId],
      );
      if (!exists[0]?.ok) {
        await queryTenant(
          userId,
          `INSERT INTO memory_relationships (source_memory_id, target_memory_id, relationship_type, strength, metadata)
           VALUES ($1, $2, 'shares_entity', $3, $4)`,
          [memoryId, m.memoryId, e.confidence, { entity_type: e.type, entity_value: e.value }],
        );
        created++;
      }
    }
  }
  return created;
}

export async function listRelatedMemories(
  userId: string,
  memoryId: string,
): Promise<{ id: string; relationshipType: string; strength: number | null }[]> {
  const rows = await queryTenant<{ id: string; relationshipType: string; strength: number | null }>(
    userId,
    `SELECT mr.id, r.relationship_type AS "relationshipType", r.strength
       FROM memory_relationships r
       JOIN memory_records mr ON mr.id IN (r.source_memory_id, r.target_memory_id)
      WHERE (r.source_memory_id = $1 OR r.target_memory_id = $1)
        AND mr.id <> $1
        AND mr.state = 'active'
      ORDER BY r.created_at DESC LIMIT 50`,
    [memoryId],
  );
  return rows;
}
