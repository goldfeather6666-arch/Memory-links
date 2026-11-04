import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { getAIProvider, getEmbeddingProvider } from "@/server/memory/providers";

const ORIG = { ...process.env };

describe("provider factories from environment", () => {
  beforeAll(() => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.AI_PROVIDER;
    delete process.env.EMBEDDING_PROVIDER;
  });

  afterAll(() => {
    process.env = ORIG;
  });

  it("returns null AI provider when none configured", () => {
    expect(getAIProvider()).toBeNull();
  });

  it("returns null embedding provider when none configured", () => {
    expect(getEmbeddingProvider()).toBeNull();
  });
});
