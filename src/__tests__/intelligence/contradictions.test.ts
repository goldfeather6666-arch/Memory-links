import { describe, expect, it } from "vitest";
import {
  classifyContradiction,
  extractNumericClaim,
  polarity,
} from "@/server/intelligence/contradictions";

function pair(aContent: string, bContent: string, opts: Partial<{
  aDate?: string | null;
  bDate?: string | null;
  aConfidence?: number;
  bConfidence?: number;
  entity?: string;
}> = {}) {
  return {
    sharedEntity: opts.entity ?? "coffee",
    a: {
      id: "m1",
      content: aContent,
      occurredAt: opts.aDate ?? null,
      createdAt: "2026-01-01T00:00:00.000Z",
      confidence: opts.aConfidence ?? 1,
    },
    b: {
      id: "m2",
      content: bContent,
      occurredAt: opts.bDate ?? null,
      createdAt: "2026-02-01T00:00:00.000Z",
      confidence: opts.bConfidence ?? 1,
    },
  };
}

describe("extractNumericClaim", () => {
  it("parses currency with suffix", () => {
    expect(extractNumericClaim("budget is $5k")).toEqual({ value: 5000, unit: "USD" });
  });

  it("parses percentages", () => {
    expect(extractNumericClaim("usage grew 18%")).toEqual({ value: 18, unit: "%" });
  });

  it("parses counted quantities", () => {
    expect(extractNumericClaim("we have 3 weeks left")).toEqual({ value: 3, unit: "weeks" });
  });

  it("returns null when multiple/none quantities present", () => {
    expect(extractNumericClaim("we shipped 5 units on Jan 1 with 10 people")).toBeNull();
    expect(extractNumericClaim("no numbers here")).toBeNull();
  });
});

describe("polarity", () => {
  it("detects positive preference", () => {
    expect(polarity("I really prefer coffee")).toBe("positive");
  });

  it("detects negative sentiment", () => {
    expect(polarity("I dislike this product")).toBe("negative");
  });

  it("returns neutral when both signals present", () => {
    expect(polarity("I like it but it is bad value")).toBe("neutral");
  });

  it("returns null when no affective signals", () => {
    expect(polarity("the sky is blue")).toBeNull();
  });
});

describe("classifyContradiction", () => {
  it("classifies identical text as duplicate", () => {
    const r = classifyContradiction(pair("I use a Samsung phone", "I use a Samsung phone"));
    expect(r.category).toBe("duplicate");
    expect(r.confidence).toBeGreaterThan(0.9);
  });

  it("classifies fresh preference flip as genuine", () => {
    const r = classifyContradiction(
      pair("I like using coffee", "I dislike using coffee"),
    );
    expect(r.category).toBe("genuine");
  });

  it("classifies time-separated change as temporal (no auto-newest)", () => {
    const r = classifyContradiction(
      pair("I use a Samsung phone", "I switched to an iPhone", {
        aDate: "2026-01-10T00:00:00.000Z",
        bDate: "2026-06-20T00:00:00.000Z",
      }),
    );
    expect(r.category).toBe("temporal");
  });

  it("classifies context-qualified statements as context", () => {
    const r = classifyContradiction(
      pair("I like coffee at work", "I dislike coffee at home"),
    );
    expect(r.category).toBe("context");
  });

  it("classifies low-confidence statements as uncertain", () => {
    const r = classifyContradiction(
      pair("I like coffee", "I dislike coffee", {
        aConfidence: 0.2,
        bConfidence: 0.2,
      }),
    );
    expect(r.category).toBe("uncertain");
  });
});
