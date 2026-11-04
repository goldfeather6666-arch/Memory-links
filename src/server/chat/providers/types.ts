/**
 * MNEMOSYNE Part 6 — provider-independent chat interface.
 *
 * The engine only depends on these types. Concrete adapters (OpenAI-compatible
 * and future others) implement them. Every adapter is written with no
 * hardcoded credentials — keys always come from validated env or decrypted
 * BYOK storage.
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface ChatCompletionResult {
  content: string;
  usage: ChatUsage;
  model: string;
}

export interface ChatStreamCallbacks {
  onToken: (delta: string) => void;
  onDone: (usage: ChatUsage) => void;
  onError: (error: Error) => void;
}

export interface ChatStreamOptions {
  maxTokens?: number;
  temperature?: number;
}

export interface ChatCompletionOptions {
  maxTokens?: number;
  temperature?: number;
}

export interface ChatProvider {
  readonly name: string;
  /** Whether the provider supports chunked streaming responses. */
  readonly supportsStreaming: boolean;
  /** Non-streaming completion. */
  complete(
    messages: ChatMessage[],
    opts?: ChatCompletionOptions,
  ): Promise<ChatCompletionResult>;
  /**
   * Streaming completion. Returns an abort function. When the provider does
   * not support streaming, implementations may fall back to buffering `complete`
   * and emitting all tokens at once.
   */
  stream?(
    messages: ChatMessage[],
    callbacks: ChatStreamCallbacks,
    opts?: ChatStreamOptions,
  ): () => void;
}

export interface ChatProviderConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface ChatProviderFactory {
  name: string;
  create(config: ChatProviderConfig): ChatProvider;
}

export interface ChatModelSet {
  small: string;
  large: string;
}

export class ProviderUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderUnavailableError";
  }
}

export class MalformedProviderOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MalformedProviderOutputError";
  }
}
