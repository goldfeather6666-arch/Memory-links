import { describe, expect, it } from "vitest";
import { contentChecksum, cosineSimilarity, normalizeText } from "@/server/memory/util";
import { normalizeSimilarity } from "@/server/memory/duplication";

describe("memory utilities", () => {
  it("computes stable checksums", () => {
    expect(contentChecksum("hello")).toBe(contentChecksum("hello"));
    expect(contentChecksum("hello")).not.toBe(contentChecksum("hello "));
  });

  it("normalizes text", () => {
    expect(normalizeText("  The Project! USES PostgreSQL.  ")).toBe("the project uses postgresql");
  });

  it("computes cosine similarity", () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
    expect(cosineSimilarity([], [])).toBe(0);
    expect(cosineSimilarity([1, 0], [1])).toBe(0);
  });

  it("detects near-identical normalized text", () => {
    expect(normalizeSimilarity(normalizeText("the project uses postgres"), normalizeText("The project uses PostgreSQL."))).toBeGreaterThan(0.85);
    expect(normalizeSimilarity("the project uses postgres", "the user prefers rust")).toBeLessThan(0.5);
  });
});
