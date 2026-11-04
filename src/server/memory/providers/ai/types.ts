import type { AIProvider } from "@/server/memory/types";
import { z } from "zod";
import {
  MAX_ENTITY_TYPE_LENGTH,
  MAX_ENTITY_VALUE_LENGTH,
  MAX_EXTRACTED_CONTENT_LENGTH,
  MAX_EXTRACTED_SUMMARY_LENGTH,
  MAX_MEMORIES_PER_EXTRACTION,
} from "@/server/memory/constants";

/**
 * Strict zod schema for the structured JSON an AI provider must return.
 * This is the single contract that validation enforces — malformed or
 * non-conforming output is rejected and recorded as a provider failure.
 */
export const extractedMemorySchema = z.object({
  memoryType: z.enum(["episodic", "semantic", "procedural", "associative"]),
  content: z.string().trim().min(1).max(MAX_EXTRACTED_CONTENT_LENGTH),
  summary: z.string().trim().min(1).max(MAX_EXTRACTED_SUMMARY_LENGTH),
  confidence: z.number().min(0).max(1),
  validFrom: z.string().datetime().nullable().optional().default(null),
  validUntil: z.string().datetime().nullable().optional().default(null),
  entities: z
    .array(
      z.object({
        type: z.string().trim().min(1).max(MAX_ENTITY_TYPE_LENGTH),
        value: z.string().trim().min(1).max(MAX_ENTITY_VALUE_LENGTH),
      }),
    )
    .max(50)
    .optional()
    .default([]),
});

export const extractionResponseSchema = z.object({
  memories: z.array(extractedMemorySchema).max(MAX_MEMORIES_PER_EXTRACTION),
});

export type ExtractionResponse = z.infer<typeof extractionResponseSchema>;

export type AIProviderConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
};

export interface AIProviderFactory {
  name: string;
  create(config: AIProviderConfig): AIProvider;
}
