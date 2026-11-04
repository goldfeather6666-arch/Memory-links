import { describe, expect, it } from "vitest";
import { scoreImportance } from "@/server/intelligence/importance";

function scored(partial: Record<string, unknown> = {}) {
  return scoreImportance({
    id: "m1",
    memoryType: "semantic",
    importance: 0.5,
    metadata: {},
    createdAt: "2026-01-01T00:00:00.000Z",
    occurredAt: null,
    entityCount: 2,
    relationshipCount: 1,
    projectReferenced: false,
    ...partial,
  } as never);
}

describe("scoreImportance", () => {
  it("returns an explainable factor breakdown", () => {
    const d = scored();
    expect(d.importance).toBeGreaterThanOrEqual(0);
    expect(d.importance).toBeLessThanOrEqual(1);
    expect(Array.isArray(d.explanation.factors)).toBe(true);
    expect(d.explanation.factors.length).toBeGreaterThan(0);
    expect(typeof d.explanation.summary).toBe("string");
  });

  it("user-declared pinned marker dominates", () => {
    const pinned = scored({ metadata: { intelligence: { pinned: true } } });
    const plain = scored();
    expect(pinned.importance).toBeGreaterThan(plain.importance);
  });

  it("recency is a low-weight ranking signal only", () => {
    const d = scored();
    const recency = d.explanation.factors.find((f) => f.name === "recency");
    expect(recency).toBeDefined();
    expect(recency!.weight).toBeLessThan(0.1);
  });

  it("never deletes (returns score + explanation only)", () => {
    const d = scored();
    expect(d).toHaveProperty("importance");
    expect(d).toHaveProperty("explanation");
  });
});
