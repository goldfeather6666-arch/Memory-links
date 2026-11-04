import { describe, expect, it, vi, afterEach } from "vitest";
import { openaiEmbeddingProviderFactory } from "@/server/memory/providers/embeddings/openai";
import { EmbeddingProviderUnavailableError } from "@/server/memory/errors";

describe("OpenAI-compatible embedding provider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const provider = openaiEmbeddingProviderFactory.create({
    apiKey: "test-key",
    baseUrl: "https://api.example.com/v1",
    model: "text-embedding-test",
    dimensions: 1536,
  });

  it("exposes model and dimensions", () => {
    expect(provider.model).toBe("text-embedding-test");
    expect(provider.dimensions).toBe(1536);
  });

  it("parses a valid embedding response", async () => {
    const body = {
      data: [
        { embedding: [0.1, 0.2, 0.3] },
        { embedding: [0.4, 0.5, 0.6] },
      ],
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 200 })));
    const result = await provider.embed(["a", "b"]);
    expect(result.vectors).toHaveLength(2);
    expect(result.vectors[0]).toEqual([0.1, 0.2, 0.3]);
    expect(result.dimensions).toBe(1536);
  });

  it("throws on empty texts before calling the provider", async () => {
    await expect(provider.embed([])).rejects.toBeInstanceOf(EmbeddingProviderUnavailableError);
  });

  it("throws EmbeddingProviderUnavailableError on HTTP error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("boom", { status: 429 })));
    await expect(provider.embed(["a"])).rejects.toBeInstanceOf(EmbeddingProviderUnavailableError);
  });

  it("throws when the provider returns a mismatched number of vectors", async () => {
    const body = { data: [{ embedding: [1, 2, 3] }] };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 200 })));
    await expect(provider.embed(["a", "b"])).rejects.toBeInstanceOf(EmbeddingProviderUnavailableError);
  });
});
