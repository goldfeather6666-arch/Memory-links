/**
 * MNEMOSYNE Part 6 — OpenAI-compatible chat provider adapter.
 *
 * Uses the platform fetch (Node 18+/Next server), so no extra dependency is
 * required. Handles both non-streaming completions and SSE streaming. All
 * credentials come from the caller (env or decrypted BYOK) — never hardcoded.
 */

import type {
  ChatCompletionResult,
  ChatMessage,
  ChatProvider,
  ChatProviderConfig,
  ChatStreamCallbacks,
  ChatUsage,
} from "./types";
import { MalformedProviderOutputError, ProviderUnavailableError } from "./types";

interface OpenAIErrorBody {
  error?: { message?: string; type?: string };
}

export class OpenAIProvider implements ChatProvider {
  readonly name = "openai";
  readonly supportsStreaming = true;

  constructor(private readonly config: ChatProviderConfig) {}

  private get endpoint() {
    return `${this.config.baseUrl.replace(/\/$/, "")}/chat/completions`;
  }

  private headers() {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.config.apiKey}`,
    };
  }

  private async throwFromResponse(res: Response): Promise<never> {
    let detail = "";
    try {
      const body = (await res.json()) as OpenAIErrorBody;
      detail = body.error?.message ?? "";
    } catch {
      /* non-JSON error body */
    }
    throw new ProviderUnavailableError(
      `OpenAI request failed (${res.status})${detail ? `: ${detail}` : ""}`,
    );
  }

  private buildBody(
    messages: ChatMessage[],
    opts?: { maxTokens?: number; temperature?: number; stream?: boolean },
  ) {
    const body: Record<string, unknown> = {
      model: this.config.model,
      messages,
      temperature: opts?.temperature ?? 0.3,
      n: 1,
    };
    if (opts?.maxTokens) body.max_tokens = opts.maxTokens;
    if (opts?.stream) body.stream = true;
    return body;
  }

  async complete(
    messages: ChatMessage[],
    opts?: { maxTokens?: number; temperature?: number },
  ): Promise<ChatCompletionResult> {
    let res: Response;
    try {
      res = await fetch(this.endpoint, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(this.buildBody(messages, opts)),
      });
    } catch (e) {
      throw new ProviderUnavailableError(`OpenAI network error: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (!res.ok) await this.throwFromResponse(res);
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
      model?: string;
    };
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      throw new MalformedProviderOutputError("OpenAI returned an empty content response.");
    }
    const usage: ChatUsage = {
      inputTokens: data.usage?.prompt_tokens ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0,
    };
    return { content, usage, model: data.model ?? this.config.model };
  }

  stream(
    messages: ChatMessage[],
    callbacks: ChatStreamCallbacks,
    opts?: { maxTokens?: number; temperature?: number },
  ): () => void {
    const controller = new AbortController();
    void this.runStream(controller, messages, callbacks, opts);
    return () => controller.abort();
  }

  private async runStream(
    controller: AbortController,
    messages: ChatMessage[],
    callbacks: ChatStreamCallbacks,
    opts?: { maxTokens?: number; temperature?: number },
  ): Promise<void> {
    let res: Response;
    try {
      res = await fetch(this.endpoint, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(this.buildBody(messages, { ...opts, stream: true })),
        signal: controller.signal,
      });
    } catch (e) {
      callbacks.onError(
        e instanceof Error && e.name === "AbortError"
          ? new Error("aborted")
          : new ProviderUnavailableError(`OpenAI network error: ${e instanceof Error ? e.message : String(e)}`),
      );
      return;
    }
    if (!res.ok) {
      try {
        await this.throwFromResponse(res);
      } catch (e) {
        callbacks.onError(e instanceof Error ? e : new Error(String(e)));
      }
      return;
    }
    if (!res.body) {
      callbacks.onError(new MalformedProviderOutputError("OpenAI stream returned no body."));
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let usage: ChatUsage = { inputTokens: 0, outputTokens: 0 };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const payload = trimmed.slice(5).trim();
          if (payload === "[DONE]") continue;
          try {
            const json = JSON.parse(payload) as {
              choices?: { delta?: { content?: string }; finish_reason?: string }[];
              usage?: { prompt_tokens?: number; completion_tokens?: number };
            };
            const delta = json.choices?.[0]?.delta?.content;
            if (delta) callbacks.onToken(delta);
            if (json.usage) {
              usage = {
                inputTokens: json.usage.prompt_tokens ?? 0,
                outputTokens: json.usage.completion_tokens ?? 0,
              };
            }
          } catch {
            // ignore malformed SSE frames
          }
        }
      }
    } catch (e) {
      callbacks.onError(
        e instanceof Error && e.name === "AbortError"
          ? new Error("aborted")
          : e instanceof Error
            ? e
            : new Error(String(e)),
      );
      return;
    }
    callbacks.onDone(usage);
  }
}

export function createOpenAIProvider(config: ChatProviderConfig): ChatProvider {
  return new OpenAIProvider(config);
}
