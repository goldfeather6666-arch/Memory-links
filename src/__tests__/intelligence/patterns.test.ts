import { describe, expect, it } from "vitest";
import { detectPatterns, type PatternMemoryInput } from "@/server/intelligence/patterns";

function mem(partial: Partial<PatternMemoryInput> & { id: string }): PatternMemoryInput {
  return {
    content: "content",
    summary: null,
    memoryType: "episodic",
    occurredAt: "2026-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    entities: [],
    ...partial,
  };
}

describe("detectPatterns", () => {
  it("returns nothing for empty input", () => {
    expect(detectPatterns([])).toEqual([]);
  });

  it("detects a frequent project from >=3 observations across distinct dates", () => {
    const ms = [1, 2, 3].map((i) =>
      mem({
        id: `m${i}`,
        occurredAt: `2026-0${i}-10T00:00:00.000Z`,
        entities: [{ type: "project", value: "Nova" }],
      }),
    );
    const out = detectPatterns(ms);
    const p = out.find((r) => r.patternType === "frequent_project");
    expect(p).toBeDefined();
    expect(p!.memoryIds.length).toBe(3);
    expect(p!.confidence).toBeGreaterThan(0.4);
  });

  it("requires multiple supporting observations (no premature patterns)", () => {
    const out = detectPatterns([
      mem({ id: "x", entities: [{ type: "project", value: "Solo" }] }),
    ]);
    expect(out.some((r) => r.patternType === "frequent_project")).toBe(false);
  });

  it("detects consistent preferences across dates", () => {
    const ms = [1, 2, 3].map((i) =>
      mem({
        id: `p${i}`,
        content: "I prefer dark mode over light mode",
        occurredAt: `2026-0${i}-05T00:00:00.000Z`,
      }),
    );
    const out = detectPatterns(ms);
    expect(out.some((r) => r.patternType === "consistent_preference")).toBe(true);
  });

  it("caps confidence so patterns are never presented as certain", () => {
    const out = detectPatterns([
      mem({ id: "m1", entities: [{ type: "project", value: "Big" }] }),
      mem({ id: "m2", entities: [{ type: "project", value: "Big" }] }),
      mem({ id: "m3", entities: [{ type: "project", value: "Big" }] }),
      mem({ id: "m4", entities: [{ type: "project", value: "Big" }] }),
      mem({ id: "m5", entities: [{ type: "project", value: "Big" }] }),
    ]);
    for (const r of out) {
      expect(r.confidence).toBeLessThanOrEqual(0.92);
    }
  });
});
