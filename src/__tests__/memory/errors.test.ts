import { describe, expect, it } from "vitest";
import {
  ConflictError,
  DimensionMismatchError,
  EmbeddingProviderUnavailableError,
  isRetryableError,
  MalformedProviderOutputError,
  MemoryEngineError,
  ProviderUnavailableError,
  ValidationError,
} from "@/server/memory/errors";

describe("memory engine errors", () => {
  it("all typed errors extend MemoryEngineError", () => {
    expect(new ProviderUnavailableError()).toBeInstanceOf(MemoryEngineError);
    expect(new EmbeddingProviderUnavailableError()).toBeInstanceOf(MemoryEngineError);
    expect(new MalformedProviderOutputError()).toBeInstanceOf(MemoryEngineError);
    expect(new DimensionMismatchError(1536, 512)).toBeInstanceOf(MemoryEngineError);
    expect(new ValidationError("x")).toBeInstanceOf(MemoryEngineError);
    expect(new ConflictError("x")).toBeInstanceOf(MemoryEngineError);
  });

  it("carries stable error codes", () => {
    expect(new ProviderUnavailableError().code).toBe("PROVIDER_UNAVAILABLE");
    expect(new EmbeddingProviderUnavailableError().code).toBe("EMBEDDING_PROVIDER_UNAVAILABLE");
    expect(new MalformedProviderOutputError().code).toBe("MALFORMED_PROVIDER_OUTPUT");
    expect(new DimensionMismatchError(1536, 512).code).toBe("DIMENSION_MISMATCH");
    expect(new ValidationError("x").code).toBe("VALIDATION_ERROR");
    expect(new ConflictError("x").code).toBe("CONFLICT");
  });

  it("reports provider-unavailable errors as retryable", () => {
    expect(isRetryableError(new ProviderUnavailableError())).toBe(true);
    expect(isRetryableError(new EmbeddingProviderUnavailableError())).toBe(true);
  });

  it("does not treat permanent failures as retryable", () => {
    expect(isRetryableError(new MalformedProviderOutputError())).toBe(false);
    expect(isRetryableError(new ValidationError("x"))).toBe(false);
    expect(isRetryableError(new Error("boom"))).toBe(false);
  });
});
