import { createHash } from "crypto";
import { queryTenant } from "@/db/client";
import { userHasWorkspaceAccess } from "@/server/data/workspaces";
import type { ExtractedFact, DuplicateDecision, MemoryView } from "@/server/memory/types";
import { normalizeText } from "@/server/memory/util";

const NORMALIZED_EXACT_THRESHOLD = 0.985;
const UPDATE_THRESHOLD = 0.82;

/**
 * Duplicate detection. Returns:
 *   - new       no meaningful duplicate found
 *   - duplicate  effectively the same memory already exists
 *   - update     same memory exists; new source adds/changes detail
 *   - conflict   exists and differs meaningfully; flag for review
 * Never silently overwrites — callers preserve history and escalate to
 * needs_review on conflict.
 */
export async function findDuplicate(
  userId: string,
  workspaceId: string,
  fact: ExtractedFact,
): Promise<DuplicateDecision> {
  if (!(await userHasWorkspaceAccess(userId, workspaceId))) {
    throw new Error("FORBIDDEN");
  }

  const candidates = await queryTenant<Record<string, unknown>>(
    userId,
    `SELECT ${MEMORY_SELECT_COLS} FROM memory_records
     WHERE workspace_id = $1 AND state = 'active'
     ORDER BY created_at DESC LIMIT 500`,
    [workspaceId],
  );

  const factNorm = normalizeText(fact.content);
  const factHash = hash(fact.content);

  let bestNormSim = 0;
  let bestNorm: MemoryView | null = null;

  for (const row of candidates) {
    const view = toView(row);
    const candidateHash = String((view.metadata as Record<string, unknown>)?.content_hash ?? "");
    if (candidateHash && candidateHash === factHash) {
      return { outcome: "duplicate", existingMemoryId: view.id, reason: "exact content match" };
    }
    const normSim = normalizeSimilarity(factNorm, normalizeText(view.content));
    if (normSim > bestNormSim) {
      bestNormSim = normSim;
      bestNorm = view;
    }
  }

  if (bestNorm && bestNormSim >= NORMALIZED_EXACT_THRESHOLD) {
    return { outcome: "duplicate", existingMemoryId: bestNorm.id, reason: "normalized text match", similarity: bestNormSim };
  }
  if (bestNorm && bestNormSim >= UPDATE_THRESHOLD) {
    return { outcome: "update", existingMemoryId: bestNorm.id, reason: "similar memory; update existing", similarity: bestNormSim };
  }
  return { outcome: "new", reason: "no duplicate found" };
}

function normalizeSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const maxLen = Math.max(a.length, b.length);
  const setA = bigrams(a);
  const setB = bigrams(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let inter = 0;
  for (const g of setA) if (setB.has(g)) inter++;
  const union = setA.size + setB.size - inter;
  const jaccard = inter / union;
  const lengthSim = 1 - Math.abs(a.length - b.length) / maxLen;
  return 0.6 * jaccard + 0.4 * lengthSim;
}

function bigrams(s: string): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
  return out;
}

function hash(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function toView(row: Record<string, unknown>): MemoryView {
  return {
    id: String(row.id),
    workspaceId: String(row.workspaceId),
    ownerId: String(row.ownerId),
    memoryType: row.memoryType as MemoryView["memoryType"],
    state: row.state as MemoryView["state"],
    content: String(row.content),
    summary: row.summary ? String(row.summary) : null,
    sourceRef: row.sourceRef ? String(row.sourceRef) : null,
    confidence: row.confidence !== null && row.confidence !== undefined ? Number(row.confidence) : null,
    importance: Number(row.importance ?? 0),
    validFrom: row.validFrom ? String(row.validFrom) : null,
    validUntil: row.validUntil ? String(row.validUntil) : null,
    privacyClassification: row.privacyClassification as MemoryView["privacyClassification"],
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    version: Number(row.version ?? 1),
    embeddingModel: row.embeddingModel ? String(row.embeddingModel) : null,
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
  };
}

export const MEMORY_SELECT_COLS = `
  id, workspace_id AS "workspaceId", owner_id AS "ownerId",
  memory_type AS "memoryType", state, content, summary, source_ref AS "sourceRef",
  confidence, importance, valid_from AS "validFrom", valid_until AS "validUntil",
  privacy_classification AS "privacyClassification", metadata,
  version, embedding_model AS "embeddingModel", embedding, embedding_dim AS "embeddingDim",
  created_at AS "createdAt", updated_at AS "updatedAt"
`;
