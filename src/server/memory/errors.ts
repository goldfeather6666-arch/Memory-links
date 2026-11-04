/**
 * Typed errors for the memory engine. Callers (job runner, API routes, server
 * actions) can inspect the type to decide whether an operation is retryable
 * (e.g. AI provider unavailable) versus a permanent failure.
 */

export class MemoryEngineError extends Error {
  readonly code: string;

  constructor(message: string, code = "MEMORY_ENGINE_ERROR") {
    super(message);
    this.name = "MemoryEngineError";
    this.code = code;
  }
}

export class ProviderUnavailableError extends MemoryEngineError {
  constructor(message = "AI provider is not configured or is unavailable.") {
    super(message, "PROVIDER_UNAVAILABLE");
    this.name = "ProviderUnavailableError";
  }
}

export class EmbeddingProviderUnavailableError extends MemoryEngineError {
  constructor(message = "Embedding provider is not configured or is unavailable.") {
    super(message, "EMBEDDING_PROVIDER_UNAVAILABLE");
    this.name = "EmbeddingProviderUnavailableError";
  }
}

export class MalformedProviderOutputError extends MemoryEngineError {
  constructor(message = "AI provider returned malformed output.") {
    super(message, "MALFORMED_PROVIDER_OUTPUT");
    this.name = "MalformedProviderOutputError";
  }
}

export class DimensionMismatchError extends MemoryEngineError {
  constructor(expected: number, received: number) {
    super(
      `Embedding dimension mismatch: column requires ${expected}, provider returned ${received}.`,
      "DIMENSION_MISMATCH",
    );
    this.name = "DimensionMismatchError";
  }
}

export class ValidationError extends MemoryEngineError {
  constructor(message: string) {
    super(message, "VALIDATION_ERROR");
    this.name = "ValidationError";
  }
}

export class ConflictError extends MemoryEngineError {
  constructor(message: string) {
    super(message, "CONFLICT");
    this.name = "ConflictError";
  }
}

export function isRetryableError(err: unknown): boolean {
  return (
    err instanceof ProviderUnavailableError ||
    err instanceof EmbeddingProviderUnavailableError ||
    err instanceof MemoryEngineError
  );
}
