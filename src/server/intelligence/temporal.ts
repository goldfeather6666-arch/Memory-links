/**
 * MNEMOSYNE Part 4 — temporal memory intelligence.
 *
 * Reasoning about *when* memories were true: derives temporal metadata, answers
 * "what was true at time T" for a workspace, provides a convenience lookup of
 * memories valid at a given instant, lets callers stamp event time
 * (occurred_at), and produces a short human-readable "temporal changes"
 * summary for the dashboard.
 *
 * Conventions: every DB function is gated on workspace membership via
 * userHasWorkspaceAccess (throws "FORBIDDEN"), all queries go through
 * queryTenant (RLS scoped to the calling user), and all rows are mapped from
 * snake_case to camelCase. Null is never invented — unknown dates stay null.
 */

import { queryTenant } from "@/db/client";
import { userHasWorkspaceAccess } from "@/server/data/workspaces";
import type { MemoryType } from "@/db/schema";
import type { HistoricalSnapshot, TemporalInfo } from "./types";

// ---------------------------------------------------------------------------
// Small row/interval helpers
// ---------------------------------------------------------------------------

function strOrNull(value: unknown): string | null {
  return value !== null && value !== undefined ? String(value) : null;
}

function numOrOne(value: unknown): number {
  const n = Number(value ?? 1);
  return Number.isNaN(n) ? 1 : n;
}

/**
 * Does the validity interval [from, until] cover `at`?
 * Null bounds are open: null from = -inf, null until = +inf. Both bounds are
 * inclusive, matching the TemporalInfo type contract.
 */
function intervalCovers(at: string, from: string | null, until: string | null): boolean {
  const atMs = Date.parse(at);
  if (Number.isNaN(atMs)) return false;
  if (from !== null) {
    const fromMs = Date.parse(from);
    if (!Number.isNaN(fromMs) && atMs < fromMs) return false;
  }
  if (until !== null) {
    const untilMs = Date.parse(until);
    if (!Number.isNaN(untilMs) && atMs > untilMs) return false;
  }
  return true;
}

/**
 * Map a memory_records row (snake_case or camelCase) to TemporalInfo.
 * Never invents dates: occurredAt is null whenever unknown.
 */
export function deriveTemporalInfo(row: Record<string, unknown>): TemporalInfo {
  return {
    occurredAt: strOrNull(row.occurredAt ?? row.occurred_at),
    createdAt: String(row.createdAt ?? row.created_at ?? ""),
    validFrom: strOrNull(row.validFrom ?? row.valid_from),
    validUntil: strOrNull(row.validUntil ?? row.valid_until),
    updatedAt: String(row.updatedAt ?? row.updated_at ?? ""),
    version: numOrOne(row.version),
  };
}

// ---------------------------------------------------------------------------
// Temporal lookups
// ---------------------------------------------------------------------------

/**
 * Return the ids of every active memory whose validity interval
 * (memory_records.valid_from/valid_until) covers `isoAt`. Convenience used by
 * other engines.
 */
export async function listMemoriesValidAt(
  userId: string,
  workspaceId: string,
  isoAt: string,
): Promise<string[]> {
  if (!(await userHasWorkspaceAccess(userId, workspaceId))) {
    throw new Error("FORBIDDEN");
  }
  const rows = await queryTenant<{ id: string }>(
    userId,
    `SELECT id
       FROM memory_records
      WHERE workspace_id = $1
        AND state = 'active'
        AND (valid_from IS NULL OR valid_from <= $2)
        AND (valid_until IS NULL OR valid_until >= $2)`,
    [workspaceId, isoAt],
  );
  return rows.map((row) => row.id);
}

interface MemoryFlatShape {
  id: string;
  memoryType: MemoryType;
  content: string;
  summary: string | null;
  version: number;
  validFrom: string | null;
  validUntil: string | null;
}

interface VersionFlatShape {
  version: number;
  validFrom: string | null;
  validUntil: string | null;
}

/**
 * What was true at `isoAt` for every ACTIVE memory in the workspace.
 *
 * For each memory:
 *  - wasTrue: true if the memory (current version) or one of its historical
 *    versions was valid at `isoAt`.
 *  - versionAtTime: the version current at `isoAt` — the current version when
 *    the record is valid, otherwise the highest historical version whose
 *    interval covers `isoAt`, else null.
 *  - reason: "existing" when the current version is still the one that was
 *    valid; "valid_at_time" when an older version was valid but a newer one
 *    has since superseded it; "not_valid_at_time" otherwise.
 */
export async function whatWasTrueAt(
  userId: string,
  workspaceId: string,
  isoAt: string,
): Promise<HistoricalSnapshot[]> {
  if (!(await userHasWorkspaceAccess(userId, workspaceId))) {
    throw new Error("FORBIDDEN");
  }

  const memoryRows = await queryTenant<Record<string, unknown>>(
    userId,
    `SELECT id, memory_type AS "memoryType", content, summary, version,
            valid_from AS "validFrom", valid_until AS "validUntil"
       FROM memory_records
      WHERE workspace_id = $1 AND state = 'active'
      ORDER BY created_at ASC`,
    [workspaceId],
  );

  if (memoryRows.length === 0) return [];

  const ids = memoryRows.map((row) => String(row.id));
  const versionRows = await queryTenant<Record<string, unknown>>(
    userId,
    `SELECT memory_id AS "memoryId", version,
            valid_from AS "validFrom", valid_until AS "validUntil"
       FROM memory_versions
      WHERE memory_id = ANY($1)
      ORDER BY version ASC`,
    [ids],
  );

  const versionsByMemory = new Map<string, VersionFlatShape[]>();
  for (const row of versionRows) {
    const memoryId = String(row.memoryId);
    const entry = versionsByMemory.get(memoryId) ?? [];
    entry.push({
      version: numOrOne(row.version),
      validFrom: strOrNull(row.validFrom),
      validUntil: strOrNull(row.validUntil),
    });
    versionsByMemory.set(memoryId, entry);
  }

  const results: HistoricalSnapshot[] = [];

  for (const row of memoryRows) {
    const memoryId = String(row.id);
    const memory: MemoryFlatShape = {
      id: memoryId,
      memoryType: row.memoryType as MemoryType,
      content: String(row.content),
      summary: strOrNull(row.summary),
      version: numOrOne(row.version),
      validFrom: strOrNull(row.validFrom),
      validUntil: strOrNull(row.validUntil),
    };

    const currentVersion = memory.version;
    // The current record state acts as the newest version.
    const currentValid = intervalCovers(isoAt, memory.validFrom, memory.validUntil);

    // Older versions come from history; ignore duplicates of the current version.
    const olderVersions = (versionsByMemory.get(memoryId) ?? []).filter(
      (version) => version.version < currentVersion,
    );
    const validOlder = olderVersions.filter((version) =>
      intervalCovers(isoAt, version.validFrom, version.validUntil),
    );

    let wasTrue: boolean;
    let reason: HistoricalSnapshot["reason"];
    let versionAtTime: number | null;

    if (currentValid) {
      wasTrue = true;
      reason = "existing";
      versionAtTime = currentVersion;
    } else if (validOlder.length > 0) {
      wasTrue = true;
      reason = "valid_at_time";
      versionAtTime = Math.max(...validOlder.map((version) => version.version));
    } else {
      wasTrue = false;
      reason = "not_valid_at_time";
      versionAtTime = null;
    }

    results.push({
      memoryId: memory.id,
      content: memory.content,
      summary: memory.summary,
      memoryType: memory.memoryType,
      wasTrue,
      versionAtTime,
      currentVersion,
      reason,
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Event-time (occurred_at)
// ---------------------------------------------------------------------------

export interface OccurredMemory {
  id: string;
  workspaceId: string;
  ownerId: string;
  memoryType: MemoryType;
  content: string;
  summary: string | null;
  occurredAt: string | null;
  createdAt: string;
  validFrom: string | null;
  validUntil: string | null;
  updatedAt: string;
  version: number;
}

/**
 * Set (or clear, when `occurredIso` is null) the event time of a memory.
 * Only allowed when the caller can access the workspace AND the memory belongs
 * to that workspace. Returns the updated row, or null if the memory is not
 * found in the workspace.
 */
export async function markOccurredAt(
  userId: string,
  workspaceId: string,
  memoryId: string,
  occurredIso: string | null,
): Promise<OccurredMemory | null> {
  if (!(await userHasWorkspaceAccess(userId, workspaceId))) {
    throw new Error("FORBIDDEN");
  }
  const rows = await queryTenant<Record<string, unknown>>(
    userId,
    `UPDATE memory_records
        SET occurred_at = $3
      WHERE id = $1 AND workspace_id = $2
      RETURNING id, workspace_id AS "workspaceId", owner_id AS "ownerId",
                memory_type AS "memoryType", content, summary,
                occurred_at AS "occurredAt",
                created_at AS "createdAt", updated_at AS "updatedAt",
                valid_from AS "validFrom", valid_until AS "validUntil", version`,
    [memoryId, workspaceId, occurredIso],
  );
  const row = rows[0];
  if (!row) return null;
  const temporal = deriveTemporalInfo(row);
  return {
    id: String(row.id),
    workspaceId: String(row.workspaceId),
    ownerId: String(row.ownerId),
    memoryType: row.memoryType as MemoryType,
    content: String(row.content),
    summary: strOrNull(row.summary),
    occurredAt: temporal.occurredAt,
    createdAt: temporal.createdAt,
    validFrom: temporal.validFrom,
    validUntil: temporal.validUntil,
    updatedAt: temporal.updatedAt,
    version: temporal.version,
  };
}

// ---------------------------------------------------------------------------
// Temporal-changes summary
// ---------------------------------------------------------------------------

/**
 * Short human-readable summary of which memories were true at `isoAt` versus
 * now, for the dashboard "temporal changes" display.
 */
export async function getWhatWasTrueSummary(
  userId: string,
  workspaceId: string,
  isoAt: string,
): Promise<string> {
  if (!(await userHasWorkspaceAccess(userId, workspaceId))) {
    throw new Error("FORBIDDEN");
  }
  const nowIso = new Date().toISOString();

  const rows = await queryTenant<Record<string, unknown>>(
    userId,
    `SELECT valid_from AS "validFrom", valid_until AS "validUntil"
       FROM memory_records
      WHERE workspace_id = $1 AND state = 'active'`,
    [workspaceId],
  );

  let trueThen = 0;
  let trueNow = 0;
  let newTrue = 0;
  let lostTrue = 0;

  for (const row of rows) {
    const validFrom = strOrNull(row.validFrom);
    const validUntil = strOrNull(row.validUntil);
    const thenValid = intervalCovers(isoAt, validFrom, validUntil);
    const nowValid = intervalCovers(nowIso, validFrom, validUntil);

    if (thenValid) trueThen += 1;
    if (nowValid) trueNow += 1;
    if (nowValid && !thenValid) newTrue += 1;
    if (thenValid && !nowValid) lostTrue += 1;
  }

  const dateLabel = isoAt.slice(0, 10);
  const parts: string[] = [
    `${trueThen} ${trueThen === 1 ? "memory was" : "memories were"} true as of ${dateLabel}`,
  ];
  if (newTrue > 0) {
    parts.push(`${newTrue} ${newTrue === 1 ? "has" : "have"} since become true`);
  }
  if (lostTrue > 0) {
    parts.push(`${lostTrue} ${lostTrue === 1 ? "is" : "are"} no longer true`);
  }
  if (newTrue === 0 && lostTrue === 0) {
    parts.push("no temporal changes");
  }
  return `${parts.join("; ")}.`;
}
