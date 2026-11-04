import type { EmbeddingProvider } from "@/server/memory/types";
import type { EmbeddingProviderConfig, EmbeddingProviderFactory } from "./types";
import { EmbeddingProviderUnavailableError } from "@/server/memory/errors";

const DEFAULT_DIMENSIONS = 1536;

export const openaiEmbeddingProviderFactory: EmbeddingProviderFactory = {
  name: "openai-compatible",
  create(config) {
    return new OpenAICompatibleEmbeddingProvider(config);
  },
};

class OpenAICompatibleEmbeddingProvider implements EmbeddingProvider {
  readonly name = "openai-compatible";

  constructor(private config: EmbeddingProviderConfig) {}

  get model(): string {
    return this.config.model;
  }

  get dimensions(): number {
    return this.config.dimensions ?? DEFAULT_DIMENSIONS;
  }

  async embed(
    texts: string[],
  ): Promise<{ vectors: number[][]; model: string; dimensions: number }> {
    if (texts.length === 0) {
      throw new EmbeddingProviderUnavailableError("No texts to embed.");
    }
    const base = this.config.baseUrl.replace(/\/$/, "");
    const body = {
      model: this.config.model,
      input: texts,
    };
    let res: Response;
    try {
      res = await fetch(`${base}/embeddings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60_000),
      });
    } catch (err) {
      throw new EmbeddingProviderUnavailableError(`Embedding request failed: ${err instanceof Error ? err.message : "network error"}`);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new EmbeddingProviderUnavailableError(`Embedding provider returned HTTP ${res.status}: ${truncate(text, 300)}`);
    }
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      throw new EmbeddingProviderUnavailableError("Embedding provider returned non-JSON.");
    }
    const data = (json as { data?: { embedding?: number[] }[] })?.data;
    if (!Array.isArray(data) || data.length !== texts.length) {
      throw new EmbeddingProviderUnavailableError("Embedding provider returned a mismatched number of vectors.");
    }
    const vectors = data.map((d) => d.embedding ?? []);
    return { vectors, model: this.config.model, dimensions: this.dimensions };
  }
}

function truncate(input: string, max: number): string {
  return input.length <= max ? input : `${input.slice(0, max)}…`;
}
