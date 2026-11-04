import { describe, expect, it } from "vitest";
import { toRetrievedEvidence } from "@/server/chat/retrieval";
import type { RelevanceResult } from "@/server/memory/types";

function makeHit(overrides: Partial<RelevanceResult> = {}, id = "mem-1"): RelevanceResult {
  return {
    id,
    workspaceId: "ws-1",
    ownerId: "u-1",
    memoryType: "episodic",
    state: "active",
    content: "We planned to build with Next.js and Postgres.",
    summary: "Original project plan",
    sourceRef: null,
    confidence: 0.9,
    importance: 80,
    validFrom: null,
    validUntil: null,
    privacyClassification: "private",
    metadata: {},
    version: 1,
    embeddingModel: null,
    createdAt: "2026-01-15T00:00:00.000Z",
    updatedAt: "2026-01-15T00:00:00.000Z",
    relevance: 0.85,
    ...overrides,
  };
}

describe("toRetrievedEvidence", () => {
  it("maps a recall hit to canonical evidence", () => {
    const ev = toRetrievedEvidence(makeHit());
    expect(ev.id).toBe("mem-1");
    expect(ev.kind).toBe("memory");
    expect(ev.type).toBe("episodic");
    expect(ev.label).toBe("Original project plan");
    expect(ev.summary).toBe("Original project plan");
    expect(ev.confidence).toBe(0.9);
    expect(ev.importance).toBe(80);
    expect(ev.createdAt).toBe("2026-01-15T00:00:00.000Z");
    expect(ev.relevance).toBeCloseTo(0.85);
    expect(ev.provenance).toBe("direct");
    expect(ev.quote).toContain("Next.js");
  });

  it("derives a label from content when summary is absent", () => {
    const ev = toRetrievedEvidence(makeHit({ summary: null, content: "Short memory content." }));
    expect(ev.label).toBe("Short memory content.");
    expect(ev.summary).toBeNull();
  });

  it("truncates summary-derived labels over 160 chars", () => {
    const content = "x".repeat(400);
    const ev = toRetrievedEvidence(makeHit({ summary: null, content }));
    expect(ev.label.length).toBeLessThanOrEqual(161);
    expect(ev.label.endsWith("…")).toBe(true);
  });

  it("clamps relevance into 0..1", () => {
    expect(toRetrievedEvidence(makeHit({ relevance: 1.4 })).relevance).toBe(1);
    expect(toRetrievedEvidence(makeHit({ relevance: -0.2 })).relevance).toBe(0);
  });
});
