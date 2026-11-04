import { afterEach, describe, expect, it, vi } from "vitest";
import { createOpenAIProvider } from "@/server/chat/providers/openai";
import { ProviderUnavailableError } from "@/server/chat/providers/types";

function makeFetchResponse(init: {
  ok?: boolean;
  status?: number;
  json?: unknown;
  body?: null;
}): Response {
  const jsonBody = init.json !== undefined ? JSON.stringify(init.json) : null;
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => init.json,
    body: init.body ?? (jsonBody ? new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(jsonBody));
        controller.close();
      },
    }) : null),
  } as unknown as Response;
}

const provider = createOpenAIProvider({
  apiKey: "sk-test",
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-test",
});

describe("OpenAIProvider.complete", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns content, usage and model on success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      makeFetchResponse({
        json: {
          choices: [{ message: { content: "Hello!" } }],
          usage: { prompt_tokens: 10, completion_tokens: 4 },
          model: "gpt-test",
        },
      }),
    ));
    const result = await provider.complete([{ role: "user", content: "hi" }]);
    expect(result.content).toBe("Hello!");
    expect(result.model).toBe("gpt-test");
    expect(result.usage.inputTokens).toBe(10);
    expect(result.usage.outputTokens).toBe(4);
  });

  it("throws ProviderUnavailableError on non-2xx", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      makeFetchResponse({
        ok: false,
        status: 401,
        json: { error: { message: "bad key" } },
      }),
    ));
    await expect(provider.complete([{ role: "user", content: "hi" }])).rejects.toThrow(ProviderUnavailableError);
  });

  it("throws on network errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNRESET")));
    await expect(provider.complete([{ role: "user", content: "hi" }])).rejects.toThrow(ProviderUnavailableError);
  });
});
