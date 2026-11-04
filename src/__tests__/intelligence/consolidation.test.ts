import { describe, expect, it } from "vitest";
import {
  buildConsolidationGroups,
  type ConsolidationMemoryInput,
} from "@/server/intelligence/consolidation";

function mem(partial: Partial<ConsolidationMemoryInput> & { id: string }): ConsolidationMemoryInput {
  return {
    content: "mem",
    summary: null,
    memoryType: "episodic",
    occurredAt: "2026-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    importance: 0.6,
    entities: [],
    ...partial,
  };
}

describe("buildConsolidationGroups", () => {
  it("groups memories sharing a project entity", () => {
    const groups = buildConsolidationGroups([
      mem({ id: "a", entities: [{ type: "project", value: "Alpha" }] }),
      mem({ id: "b", entities: [{ type: "project", value: "Alpha" }] }),
      mem({ id: "c", entities: [{ type: "project", value: "Alpha" }] }),
    ]);
    expect(groups.some((g) => g.kind === "project" && g.memoryIds.length >= 2)).toBe(true);
  });

  it("detects repeated facts from similar text", () => {
    const text = "the server times out at 5pm daily today";
    const groups = buildConsolidationGroups([
      mem({ id: "a", content: text }),
      mem({ id: "b", content: text }),
      mem({ id: "c", content: text }),
    ]);
    expect(groups.some((g) => g.kind === "repeated_fact" || g.kind === "repeated_preference")).toBe(true);
  });

  it("detects temporal change when dates differ for same subject", () => {
    const groups = buildConsolidationGroups([
      mem({
        id: "a",
        content: "I use a Samsung phone",
        occurredAt: "2026-01-10T00:00:00.000Z",
        entities: [{ type: "product", value: "Phone" }],
      }),
      mem({
        id: "b",
        content: "I switched to an iPhone",
        occurredAt: "2026-06-20T00:00:00.000Z",
        entities: [{ type: "product", value: "Phone" }],
      }),
    ]);
    expect(groups.some((g) => g.kind === "change")).toBe(true);
  });

  it("does not invent groups without enough support", () => {
    const groups = buildConsolidationGroups([
      mem({ id: "a" }),
      mem({ id: "b" }),
    ]);
    // Two unrelated, entity-less memories should produce no project/change/etc.
    expect(
      groups.some((g) => ["project", "change", "decision", "event"].includes(g.kind)),
    ).toBe(false);
  });
});
