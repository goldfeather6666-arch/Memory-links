import { describe, expect, it, vi, afterEach } from "vitest";
import { openaiProviderFactory } from "@/server/memory/providers/ai/openai";
import { MalformedProviderOutputError, ProviderUnavailableError } from "@/server/memory/errors";

describe("OpenAI-compatible AI provider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const provider = openaiProviderFactory.create({
    apiKey: "test-key",
    baseUrl: "https://api.example.com/v1",
    model: "test-model",
  });

  it("parses a valid extraction response", async () => {
    const body = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              memories: [
                {
                  memoryType: "semantic",
                  content: "The project uses PostgreSQL.",
                  summary: "Project uses PostgreSQL.",
                  confidence: 0.95,
                  validFrom: null,
                  validUntil: null,
                  entities: [{ type: "technology", value: "PostgreSQL" }],
                },
              ],
            }),
          },
        },
      ],
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 200 })));
    const result = await provider.extractMemories({ content: "any" });
    expect(result.memories).toHaveLength(1);
    expect(result.memories[0].memoryType).toBe("semantic");
  });

  it("throws ProviderUnavailableError on HTTP 500 (retryable)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("boom", { status: 500 })));
    await expect(provider.extractMemories({ content: "x" })).rejects.toBeInstanceOf(ProviderUnavailableError);
  });

  it("throws MalformedProviderOutputError on invalid JSON content", async () => {
    const body = { choices: [{ message: { content: "{ not json" } }] };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 200 })));
    await expect(provider.extractMemories({ content: "x" })).rejects.toBeInstanceOf(MalformedProviderOutputError);
  });

  it("throws MalformedProviderOutputError on schema-invalid output", async () => {
    const body = {
      choices: [
        {
          message: {
            content: JSON.stringify({ memories: [{ memoriesType: "not-a-type", content: "x", summary: "y", confidence: 9 }] }),
          },
        },
      ],
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 200 })));
    await expect(provider.extractMemories({ content: "x" })).rejects.toBeInstanceOf(MalformedProviderOutputError);
  });

  it("returns no memories for an empty list", async () => {
    const body = { choices: [{ message: { content: JSON.stringify({ memories: [] }) } }] };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 200 })));
    const result = await provider.extractMemories({ content: "x" });
    expect(result.memories).toEqual([]);
  });
});
