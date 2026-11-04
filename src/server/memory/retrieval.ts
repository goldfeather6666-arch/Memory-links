import { queryTenant } from "@/db/client";
import { userHasWorkspaceAccess } from "@/server/data/workspaces";
import { getEmbeddingProvider } from "@/server/memory/providers";
import { clamp01, cosineSimilarity } from "@/server/memory/util";
import type {
  MemoryType,
  MemoryState,
  PrivacyClassification,
  RecallMethod,
  RecallOptions,
  RecallResult,
  RelevanceResult,
} from "@/server/memory/types";

const CANDIDATE_LIMIT = 300;

export async function recallMemories(
  userId: string,
  opts: RecallOptions,
): Promise<RecallResult> {
  if (!(await userHasWorkspaceAccess(userId, opts.workspaceId))) {
    throw new Error("FORBIDDEN");
  }

  const states: MemoryState[] = opts.states?.length ? opts.states : ["active"];
  const limit = Math.min(opts.limit ?? 20, 100);
  const offset = opts.offset ?? 0;
  const query = opts.query?.trim() ?? "";

  const where: string[] = [`workspace_id = $1`];
  const values: unknown[] = [opts.workspaceId];

  values.push(states);
  where.push(`state = ANY($${values.length})`);

  if (opts.memoryTypes?.length) {
    values.push(opts.memoryTypes);
    where.push(`memory_type = ANY($${values.length})`);
  }
  if (opts.sourceRef) {
    values.push(opts.sourceRef);
    where.push(`source_ref = $${values.length}`);
  }
  if (opts.from) {
    values.push(opts.from);
    where.push(`created_at >= $${values.length}`);
  }
  if (opts.to) {
    values.push(opts.to);
    where.push(`created_at <= $${values.length}`);
  }
  if (opts.minConfidence !== undefined) {
    values.push(opts.minConfidence);
    where.push(`confidence >= $${values.length}`);
  }
  if (opts.privacyClassifications?.length) {
    values.push(opts.privacyClassifications);
    where.push(`privacy_classification = ANY($${values.length})`);
  }

  const whereSql = where.join(" AND ");

  const provider = getEmbeddingProvider();
  const canSemantic = Boolean(query && provider);
  let method: RecallMethod = opts.method ?? (canSemantic ? "hybrid" : "keyword");
  if ((method === "semantic" || method === "hybrid") && !canSemantic) {
    method = "keyword";
  }

  // Total matching rows (before ranking pagination).
  const countRows = await queryTenant<{ count: string }>(
    userId,
    `SELECT count(*)::text AS count FROM memory_records WHERE ${whereSql}`,
    values,
  );
  const total = Number(countRows[0]?.count ?? 0);

  let queryVector: number[] | null = null;
  if (canSemantic && provider) {
    const result = await provider.embed([query]);
    queryVector = result.vectors[0] ?? null;
  }

  let orderSql = `created_at DESC`;
  if (query && method === "keyword") {
    values.push(query);
    orderSql = `ts_rank_cd(search_vector, plainto_tsquery('english', $${values.length})) DESC, created_at DESC`;
  }

  const rows = await queryTenant<Record<string, unknown>>(
    userId,
    `SELECT ${MEMORY_SELECT_COLS}, embedding
       FROM memory_records
      WHERE ${whereSql}
      ORDER BY ${orderSql}
      LIMIT ${CANDIDATE_LIMIT}`,
    values,
  );

  if (rows.length === 0) {
    return { items: [], total, method };
  }

  type Scored = { view: RelevanceResult; rank: number | null; cos: number | null };
  const scored: Scored[] = rows.map((row) => {
    const base = toRelevance(row);
    const rank = row.rank !== undefined && row.rank !== null ? Number(row.rank) : null;
    let cos: number | null = null;
    if (queryVector && row.embedding) {
      const vec = parseVector(row.embedding);
      if (vec) cos = cosineSimilarity(queryVector, vec);
    }
    return { view: base, rank, cos };
  });

  let maxRank = 1;
  for (const s of scored) if (s.rank !== null && s.rank > maxRank) maxRank = s.rank;

  for (const s of scored) {
    const lex = s.rank !== null ? clamp01(s.rank / maxRank) : 0;
    const sem = s.cos !== null ? clamp01(s.cos) : 0;
    if (method === "semantic") s.view.relevance = sem;
    else if (method === "keyword") s.view.relevance = lex;
    else s.view.relevance = 0.5 * lex + 0.5 * sem;
  }

  scored.sort((a, b) => b.view.relevance - a.view.relevance || b.view.updatedAt.localeCompare(a.view.updatedAt));

  const items = scored.slice(offset, offset + limit).map((s) => s.view);
  return { items, total, method };
}

function toRelevance(row: Record<string, unknown>): RelevanceResult {
  return {
    id: String(row.id),
    workspaceId: String(row.workspaceId),
    ownerId: String(row.ownerId),
    memoryType: row.memoryType as MemoryType,
    state: row.state as MemoryState,
    content: String(row.content),
    summary: row.summary ? String(row.summary) : null,
    sourceRef: row.sourceRef ? String(row.sourceRef) : null,
    confidence: row.confidence !== null && row.confidence !== undefined ? Number(row.confidence) : null,
    importance: Number(row.importance ?? 0),
    validFrom: row.validFrom ? String(row.validFrom) : null,
    validUntil: row.validUntil ? String(row.validUntil) : null,
    privacyClassification: row.privacyClassification as PrivacyClassification,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    version: Number(row.version ?? 1),
    embeddingModel: row.embeddingModel ? String(row.embeddingModel) : null,
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
    relevance: 0,
  };
}

function parseVector(value: unknown): number[] | null {
  if (Array.isArray(value)) return value.map((n) => Number(n));
  if (typeof value === "string") {
    const m = value.match(/\[[\s\S]*\]/);
    if (!m) return null;
    try {
      const arr = JSON.parse(m[0]);
      if (Array.isArray(arr)) return arr.map((n) => Number(n));
    } catch {
      return null;
    }
  }
  return null;
}

export const MEMORY_SELECT_COLS = `
  id, workspace_id AS "workspaceId", owner_id AS "ownerId",
  memory_type AS "memoryType", state, content, summary, source_ref AS "sourceRef",
  confidence, importance, valid_from AS "validFrom", valid_until AS "validUntil",
  privacy_classification AS "privacyClassification", metadata,
  version, embedding_model AS "embeddingModel", embedding_dim AS "embeddingDim",
  created_at AS "createdAt", updated_at AS "updatedAt",
  ts_rank_cd(search_vector, plainto_tsquery('english', $q)) AS rank
`;
