import { queryTenant } from "@/db/client";
import { userHasWorkspaceAccess } from "@/server/data/workspaces";
import { getEmbeddingProvider } from "@/server/memory/providers";
import { getMemory } from "@/server/memory/storage";
import { DimensionMismatchError, EmbeddingProviderUnavailableError } from "@/server/memory/errors";

/** The reserved embedding column dimension from migration 0001. */
export const EMBEDDING_COLUMN_DIM = 1536;

/**
 * Generate and store an embedding for a memory. Dimensions are validated
 * against the column before insertion; a mismatch is a hard configuration
 * error. Provider failures are surfaced as retryable errors.
 */
export async function embedMemory(
  userId: string,
  memoryId: string,
): Promise<{ model: string; dimensions: number } | null> {
  const memory = await getMemory(userId, memoryId);
  if (!memory) return null;
  if (!(await userHasWorkspaceAccess(userId, memory.workspaceId))) {
    throw new Error("FORBIDDEN");
  }

  const provider = getEmbeddingProvider();
  if (!provider) {
    throw new EmbeddingProviderUnavailableError();
  }
  if (provider.dimensions !== EMBEDDING_COLUMN_DIM) {
    throw new DimensionMismatchError(EMBEDDING_COLUMN_DIM, provider.dimensions);
  }

  const text = memory.summary ? `${memory.content} ${memory.summary}` : memory.content;
  const result = await provider.embed([text]);
  const vector = result.vectors[0];
  if (!vector || vector.length !== EMBEDDING_COLUMN_DIM) {
    throw new DimensionMismatchError(EMBEDDING_COLUMN_DIM, vector?.length ?? 0);
  }

  const vecLiteral = `[${vector.join(",")}]`;
  await queryTenant(
    userId,
    `UPDATE memory_records SET embedding = $2::vector, embedding_model = $3, embedding_dim = $4
     WHERE id = $1`,
    [memoryId, vecLiteral, result.model, result.dimensions],
  );

  return { model: result.model, dimensions: result.dimensions };
}

export async function reembedMemory(
  userId: string,
  memoryId: string,
): Promise<{ model: string; dimensions: number } | null> {
  const memory = await getMemory(userId, memoryId);
  if (!memory) return null;
  await embedMemory(userId, memoryId);
  return {
    model: memory.embeddingModel ?? "unknown",
    dimensions: EMBEDDING_COLUMN_DIM,
  };
}

export async function listFailedEmbeddings(
  userId: string,
): Promise<{ memoryId: string; error: string }[]> {
  const rows = await queryTenant<{ memoryId: string; error: string }>(
    userId,
    `SELECT target_id AS "memoryId", last_error AS error
       FROM processing_jobs
      WHERE kind = 'embedding' AND state IN ('failed','retryable') AND owner_id = $1`,
    [userId],
  );
  return rows;
}
