import { getServerEnv } from "@/lib/env";
import type { AIProvider } from "@/server/memory/types";
import { openaiProviderFactory } from "./ai/openai";
import type { EmbeddingProvider } from "@/server/memory/types";
import { openaiEmbeddingProviderFactory } from "./embeddings/openai";

/**
 * Provider factories resolve configured AI / embedding providers from the
 * validated server environment. They ALWAYS return null when no provider is
 * configured — the engine then records a retryable failure rather than
 * fabricating memories or embeddings.
 */

export function getAIProvider(): AIProvider | null {
  try {
    const env = getServerEnv();
    if (env.AI_PROVIDER !== "openai") return null;
    if (!env.OPENAI_API_KEY) return null;
    return openaiProviderFactory.create({
      apiKey: env.OPENAI_API_KEY,
      baseUrl: env.OPENAI_BASE_URL,
      model: env.OPENAI_MODEL,
    });
  } catch {
    return null;
  }
}

export function getEmbeddingProvider(): EmbeddingProvider | null {
  try {
    const env = getServerEnv();
    if (env.EMBEDDING_PROVIDER !== "openai") return null;
    if (!env.OPENAI_API_KEY) return null;
    const dimensions = Number(env.EMBEDDING_DIM ?? 1536);
    return openaiEmbeddingProviderFactory.create({
      apiKey: env.OPENAI_API_KEY,
      baseUrl: env.OPENAI_BASE_URL,
      model: env.EMBEDDING_MODEL,
      dimensions: Number.isFinite(dimensions) ? dimensions : 1536,
    });
  } catch {
    return null;
  }
}
