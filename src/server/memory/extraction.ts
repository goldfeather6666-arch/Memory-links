import { queryTenant } from "@/db/client";
import { userHasWorkspaceAccess } from "@/server/data/workspaces";
import { getAIProvider } from "@/server/memory/providers";
import { ProviderUnavailableError } from "@/server/memory/errors";
import { classifyFact, secondaryClassifiers } from "@/server/memory/classification";
import { findDuplicate } from "@/server/memory/duplication";
import { insertMemoryFromFact, setMemoryState, updateMemory } from "@/server/memory/storage";
import { enqueueJob } from "@/server/memory/queue";
import { detectAndCreateRelationships } from "@/server/memory/relationships";
import {
  bumpIngestionAttempt,
  getIngestion,
  setIngestionStatus,
} from "@/server/memory/ingestion";
import type { EntityRef, ExtractedFact } from "@/server/memory/types";

/**
 * Run the extraction job for an ingestion record. Requires an AI provider;
 * if none is configured it throws ProviderUnavailableError (queue marks the
 * job retryable and the ingestion preserved). Never fabricates memories.
 */
export async function runExtractionJob(
  userId: string,
  ingestionId: string,
): Promise<{ created: number; updated: number; duplicates: number; conflicts: number }> {
  const ingestion = await getIngestion(userId, ingestionId);
  if (!ingestion) {
    throw new Error("Ingestion not found.");
  }
  if (!(await userHasWorkspaceAccess(userId, ingestion.workspaceId))) {
    throw new Error("FORBIDDEN");
  }

  await bumpIngestionAttempt(ingestionId);

  const provider = getAIProvider();
  if (!provider) {
    throw new ProviderUnavailableError();
  }

  const rows = await queryTenant<{ content: string }>(
    userId,
    `SELECT content FROM ingestion_records WHERE id = $1`,
    [ingestionId],
  );
  const content = rows[0]?.content ?? "";
  if (!content) {
    throw new Error("Ingestion has no content.");
  }

  const response = await provider.extractMemories({ content });

  let created = 0;
  let updated = 0;
  let duplicates = 0;
  let conflicts = 0;
  const producedEntities: { memoryId: string; entities: EntityRef[] }[] = [];

  for (const raw of response.memories) {
    const fact = classifyFact({
      memoryType: raw.memoryType,
      content: raw.content,
      summary: raw.summary,
      confidence: raw.confidence,
      validFrom: raw.validFrom,
      validUntil: raw.validUntil,
      entities: (raw.entities ?? []).map((e) => ({
        type: e.type,
        value: e.value,
        confidence: raw.confidence,
      })),
    } as ExtractedFact);

    const decision = await findDuplicate(userId, ingestion.workspaceId, fact);

    if (decision.outcome === "new") {
      const view = await insertMemoryFromFact(userId, ingestion.workspaceId, fact, {
        ingestionId: ingestion.id,
        reason: "extraction",
      });
      created++;
      producedEntities.push({ memoryId: view.id, entities: fact.entities });
      await enqueueJob(userId, ingestion.workspaceId, "embedding", view.id);
    } else if (decision.outcome === "update" && decision.existingMemoryId) {
      await updateMemory(userId, decision.existingMemoryId, {
        content: fact.content,
        summary: fact.summary,
        memoryType: fact.memoryType,
        confidence: fact.confidence,
        changeReason: "dedup_update",
      });
      updated++;
    } else if (decision.outcome === "conflict" && decision.existingMemoryId) {
      await setMemoryState(userId, decision.existingMemoryId, "needs_review", "dedup_conflict");
      conflicts++;
    } else {
      duplicates++;
    }
  }

  for (const p of producedEntities) {
    await detectAndCreateRelationships(userId, ingestion.workspaceId, p.memoryId, p.entities);
  }

  await setIngestionStatus(ingestionId, "completed", null);
  return { created, updated, duplicates, conflicts };
}

export function buildExtractionMetadata(fact: ExtractedFact): Record<string, unknown> {
  return {
    secondary: secondaryClassifiers(fact),
    engine: "part3",
  };
}
