import { describe, expect, it } from "vitest";
import {
  candidateEntitiesFromMemory,
  normalizeEntityName,
} from "@/server/intelligence/entities";

describe("normalizeEntityName", () => {
  it("title-cases and collapses whitespace", () => {
    expect(normalizeEntityName("  acme   corp ")).toBe("Acme Corp");
  });

  it("preserves acronyms", () => {
    expect(normalizeEntityName("openAI")).toBe("openAI");
    expect(normalizeEntityName("AI")).toBe("AI");
  });

  it("returns empty string for empty input", () => {
    expect(normalizeEntityName("   ")).toBe("");
  });
});

describe("candidateEntitiesFromMemory", () => {
  const base = {
    id: "m1",
    content: "We are building BestApp for Acme Inc.",
    summary: null,
    entities: [{ type: "project", value: "BestApp", confidence: 0.9 }],
  };

  it("maps an entity row to a normalized candidate preserving type + confidence", () => {
    const out = candidateEntitiesFromMemory(base);
    const project = out.find((e) => e.entityType === "project");
    expect(project).toBeDefined();
    expect(project!.canonicalName).toBe("BestApp");
    expect(project!.confidence).toBeCloseTo(0.9);
  });

  it("detects organization candidates from a company suffix", () => {
    const out = candidateEntitiesFromMemory(base);
    const org = out.find((e) => e.entityType === "organization");
    expect(org).toBeDefined();
    expect(org!.canonicalName).toContain("Acme Inc");
    expect(org!.aliases.length).toBeGreaterThan(0);
  });

  it("merges duplicate candidates across rows (max confidence, union aliases)", () => {
    const out = candidateEntitiesFromMemory({
      ...base,
      entities: [
        { type: "organization", value: "Acme Inc", confidence: 0.4 },
        { type: "organization", value: "Acme Inc.", confidence: 0.8 },
      ],
    });
    const orgs = out.filter((e) => e.entityType === "organization");
    expect(orgs.length).toBe(1);
    expect(orgs[0].confidence).toBeCloseTo(0.8);
  });

  it("falls back to concept type for unknown types", () => {
    const out = candidateEntitiesFromMemory({
      ...base,
      entities: [{ type: "weird", value: "thing", confidence: 0.5 }],
    });
    const concept = out.find((e) => e.canonicalName === "Thing");
    expect(concept?.entityType).toBe("concept");
  });
});
