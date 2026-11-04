import { describe, expect, it } from "vitest";
import { validateAnswer } from "@/server/chat/validate";
import type { ChatAnswer, RetrievedEvidence } from "@/server/chat/types";

function evidence(id: string): RetrievedEvidence {
  return {
    id,
    kind: "memory",
    type: "project",
    label: "label",
    summary: null,
    confidence: 0.5,
    importance: 10,
    createdAt: "2026-01-15T00:00:00.000Z",
    quote: null,
    content: "content",
    validFrom: null,
    validUntil: null,
    occurredAt: null,
    relevance: 0.5,
    provenance: "direct",
  };
}

function answer(overrides: Partial<ChatAnswer> = {}): ChatAnswer {
  return {
    content: "Grounded answer",
    evidence: [],
    uncertainty: false,
    generatedBy: "llm",
    model: "gpt-test",
    usage: { inputTokens: 10, outputTokens: 5 },
    ...overrides,
  };
}

describe("validateAnswer", () => {
  it("rejects empty output", () => {
    const r = validateAnswer(answer({ content: "   " }), []);
    expect(r.valid).toBe(false);
    expect(r.reason).toBe("empty_response");
  });

  it("accepts a valid answer", () => {
    const r = validateAnswer(answer(), [evidence("m1")]);
    expect(r.valid).toBe(true);
  });

  it("drops citations not in the retrieved set", () => {
    const a = answer();
    a.evidence = [
      { id: "m1", kind: "memory", type: "project", label: "l", summary: null, confidence: 0.5, importance: 1, createdAt: "2026-01-01T00:00:00.000Z", quote: null, provenance: "direct" },
      { id: "FABRICATED", kind: "memory", type: "project", label: "l", summary: null, confidence: 0.5, importance: 1, createdAt: "2026-01-01T00:00:00.000Z", quote: null, provenance: "direct" },
    ];
    const r = validateAnswer(a, [evidence("m1")]);
    expect(r.valid).toBe(true);
    // FABRICATED reference is removed.
    expect(a.evidence.map((e) => e.id)).not.toContain("FABRICATED");
    expect(a.evidence.map((e) => e.id)).toContain("m1");
  });

  it("truncates oversized content", () => {
    const r = validateAnswer(answer({ content: "z".repeat(20_000) }), []);
    expect(r.valid).toBe(true);
    expect(r.content.length).toBeLessThanOrEqual(12_000);
  });
});
