import { describe, expect, it } from "vitest";
import { preprocessContent, isSupportedSourceType } from "@/server/memory/preprocess";
import { ValidationError } from "@/server/memory/errors";

describe("preprocessContent", () => {
  it("rejects empty content", () => {
    expect(() => preprocessContent("")).toThrow(ValidationError);
    expect(() => preprocessContent("   ")).toThrow(ValidationError);
  });

  it("normalizes and trims content, computes size bytes", () => {
    const out = preprocessContent("  Hello world  ");
    expect(out.content).toBe("Hello world");
    expect(out.content).toBe("Hello world");
    expect(out.sizeBytes).toBeGreaterThan(0);
  });

  it("strips control characters but keeps newlines/tabs", () => {
    const out = preprocessContent("a\u0000b\u0001c\nd\te");
    expect(out.content).toBe("abcd\ne");
  });

  it("truncates the preview to 800 chars", () => {
    const long = "x".repeat(2000);
    const out = preprocessContent(long);
    expect(out.preview.length).toBeLessThanOrEqual(801);
    expect(out.content.length).toBe(2000);
  });

  it("rejects content exceeding the size limit", () => {
    const big = "x".repeat(500_001);
    expect(() => preprocessContent(big)).toThrow(ValidationError);
  });
});

describe("isSupportedSourceType", () => {
  it("accepts supported source types", () => {
    expect(isSupportedSourceType("text")).toBe(true);
    expect(isSupportedSourceType("note")).toBe(true);
    expect(isSupportedSourceType("markdown")).toBe(true);
    expect(isSupportedSourceType("txt")).toBe(true);
    expect(isSupportedSourceType("pdf")).toBe(true);
    expect(isSupportedSourceType("docx")).toBe(true);
    expect(isSupportedSourceType("conversation")).toBe(true);
    expect(isSupportedSourceType("api")).toBe(true);
  });

  it("rejects unsupported source types", () => {
    expect(isSupportedSourceType("csv")).toBe(false);
    expect(isSupportedSourceType("html")).toBe(false);
  });
});
