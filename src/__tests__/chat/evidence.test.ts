import { describe, expect, it } from "vitest";
import {
  attachSupportingEvidence,
  hasEvidence,
  parseCitations,
  toEvidenceRef,
} from "@/server/chat/evidence";
import type { RetrievedEvidence } from "@/server/chat/types";

function evidence(id: string, label = `Memory ${id}`): RetrievedEvidence {
  return {
    id,
    kind: "memory",
    type: "project",
    label,
    summary: null,
    confidence: 0.8,
    importance: 50,
    createdAt: "2026-01-15T00:00:00.000Z",
    quote: "quote text",
    content: "full content",
    validFrom: null,
    validUntil: null,
    occurredAt: null,
    relevance: 0.7,
    provenance: "direct",
  };
}

describe("toEvidenceRef", () => {
  it("caps quotes at 220 chars", () => {
    const long = evidence("m1");
    long.quote = "z".repeat(400);
    const ref = toEvidenceRef(long);
    expect(ref.quote!.length).toBeLessThanOrEqual(220);
  });
});

describe("parseCitations", () => {
  const list = [evidence("m1"), evidence("m2"), evidence("m3")];

  it("keeps valid bracket citations", () => {
    const { clean, cited } = parseCitations("Use [1] and [3]", list);
    expect(clean).toBe("Use [1] and [3]");
    expect(cited.map((c) => c.id)).toEqual(["m1", "m3"]);
  });

  it("drops out-of-range citations", () => {
    const { clean, cited } = parseCitations("Use [5]", list);
    expect(clean).toBe("Use ");
    expect(cited).toEqual([]);
  });

  it("does not fabricate citations from text", () => {
    const { cited } = parseCitations("I recall the plan.", list);
    expect(cited).toEqual([]);
  });
});

describe("attachSupportingEvidence", () => {
  it("labels supporting evidence as summarized", () => {
    const { clean, cited } = attachSupportingEvidence("Here is the answer.", [evidence("m1")]);
    expect(clean).toBe("Here is the answer.");
    expect(cited[0].id).toBe("m1");
    expect(cited[0].provenance).toBe("summarized");
  });
});

describe("hasEvidence", () => {
  it("returns false for an empty list", () => {
    expect(hasEvidence([])).toBe(false);
  });
});
