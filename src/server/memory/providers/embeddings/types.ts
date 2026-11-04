import type { EmbeddingProvider } from "@/server/memory/types";

export type EmbeddingProviderConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
  dimensions: number;
};

export interface EmbeddingProviderFactory {
  name: string;
  create(config: EmbeddingProviderConfig): EmbeddingProvider;
}
