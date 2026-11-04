import { describe, expect, it } from "vitest";
import { deterministicAnswer } from "@/server/chat/answer";
import type { ChatContextPackage, RetrievedEvidence } from "@/server/chat/types";

function evidence(id: string): RetrievedEvidence {
  return {
    id,
    kind: "memory",
    type: "project",
    label: `Plan for ${id}`,
    summary: "Original plan summary",
    confidence: 0.9,
    importance: 70,
    createdAt: "2026-01-15T00:00:00.000Z",
    quote: "We planned Next.js.",
    content: "We planned to build with Next.js and Postgres.",
    validFrom: null,
    validUntil: null,
    occurredAt: null,
    relevance: 0.8,
    provenance: "direct",
  };
}

function makeContext(overrides: Partial<ChatContextPackage> = {}): ChatContextPackage {
  return {
    evidence: [],
    projects: [],
    entities: [],
    timelineEvents: [],
    conversationSummary: null,
    recentMessages: [{ role: "user", content: "What was the plan?" }],
    analysis: {
      intent: "project_summary",
      entities: [],
      timeRefs: [],
      projects: [],
      categories: [],
      answerFormat: "summary",
      keywords: ["plan"],
      requiresDeepReasoning: false,
      requiresClarification: false,
      inputTokens: 12,
    },
    ...overrides,
  };
}

describe("deterministicAnswer", () => {
  it("returns honest uncertainty when there is no evidence", () => {
    const answer = deterministicAnswer(makeContext());
    expect(answer.uncertainty).toBe(true);
    expect(answer.generatedBy).toBe("deterministic");
    expect(answer.evidence).toEqual([]);
    expect(answer.content).toMatch(/couldn't find|can't give/i);
  });

  it("surfaces retrieved memories with inline citations", () => {
    const ctx = makeContext({ evidence: [evidence("m1"), evidence("m2")] });
    const answer = deterministicAnswer(ctx);
    expect(answer.uncertainty).toBe(false);
    expect(answer.content).toContain("[1]");
    expect(answer.content).toContain("[2]");
    expect(answer.evidence.length).toBe(2);
  });

  it("never fabricates content absent from evidence", () => {
    const ctx = makeContext({ evidence: [evidence("m1")] });
    const answer = deterministicAnswer(ctx);
    expect(answer.content).toContain("Plan for m1");
    expect(answer.content).not.toContain("I remember you said X");
  });
});
