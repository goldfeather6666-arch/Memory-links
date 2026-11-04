import type { MemoryType } from "@/db/schema";
import { MEMORY_TYPES } from "@/server/memory/constants";
import { ValidationError } from "@/server/memory/errors";
import type { ExtractedFact } from "@/server/memory/types";

/**
 * Classification module. The AI provider assigns a primary type; this module
 * validates it against the allowed set and returns a type-safe ExtractedFact.
 */

export function normalizeFactType(value: unknown): MemoryType {
  if (typeof value === "string" && (MEMORY_TYPES as readonly string[]).includes(value)) {
    return value as MemoryType;
  }
  throw new ValidationError(`Invalid memory type: ${String(value)}`);
}

export function classifyFact(fact: ExtractedFact): ExtractedFact {
  return { ...fact, memoryType: normalizeFactType(fact.memoryType) };
}

export function secondaryClassifiers(fact: ExtractedFact): string[] {
  const tags: string[] = [];
  if (fact.confidence < 0.5) tags.push("low_confidence");
  if (fact.entities.length > 0) tags.push("has_entities");
  return tags;
}
