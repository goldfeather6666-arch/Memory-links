import { describe, expect, it } from "vitest";
import { classifyFact, normalizeFactType } from "@/server/memory/classification";
import { ValidationError } from "@/server/memory/errors";
import type { ExtractedFact } from "@/server/memory/types";

const base: ExtractedFact = {
  memoryType: "episodic",
  content: "Completed the deploy.",
  summary: "Completed the deploy.",
  confidence: 0.8,
  validFrom: null,
  validUntil: null,
  entities: [],
};

describe("classification", () => {
  it("accepts all four primary types", () => {
    for (const t of ["episodic", "semantic", "procedural", "associative"] as const) {
      expect(normalizeFactType(t)).toBe(t);
    }
  });

  it("passes through a valid fact unchanged", () => {
    expect(classifyFact(base).memoryType).toBe("episodic");
  });

  it("throws ValidationError for an invalid type", () => {
    expect(() => normalizeFactType("banana")).toThrow(ValidationError);
    expect(() => classifyFact({ ...base, memoryType: "banana" as never })).toThrow(ValidationError);
  });
});
