import { describe, expect, it } from "vitest";
import {
  buildCsvEdges,
  buildCsvNodes,
  clamp01,
  detectClusters,
  dropDisconnectedNodes,
  isDirected,
  nodeExistsAt,
  normalizeEntityNode,
  normalizeMemoryNode,
  type GraphEdge,
  type GraphNode,
} from "@/server/intelligence/graph";

function makeNode(overrides: Partial<GraphNode> = {}): GraphNode {
  return {
    id: "memory:m1",
    kind: "memory",
    type: "semantic",
    label: "Test memory",
    subtitle: "semantic",
    importance: 50,
    weight: 0.5,
    confidence: 0.5,
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    occurredAt: null,
    validFrom: null,
    validUntil: null,
    ...overrides,
  };
}

function makeEdge(overrides: Partial<GraphEdge> = {}): GraphEdge {
  return {
    id: "rel:r1",
    source: "memory:m1",
    target: "memory:m2",
    type: "related_to",
    directed: false,
    strength: 0.6,
    confidence: 0.6,
    createdAt: "2025-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("normalizeEntityNode", () => {
  it("maps an entities row to a GraphNode with prefixed id", () => {
    const node = normalizeEntityNode({
      id: "e1",
      type: "person",
      label: "Ada",
      confidence: 0.8,
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
    });
    expect(node.id).toBe("entity:e1");
    expect(node.kind).toBe("entity");
    expect(node.type).toBe("person");
    expect(node.weight).toBeCloseTo(0.8);
    expect(node.importance).toBe(80);
    expect(node.confidence).toBe(0.8);
    expect(node.occurredAt).toBeNull();
  });

  it("handles null confidence", () => {
    const node = normalizeEntityNode({
      id: "e1",
      type: "concept",
      label: "X",
      confidence: null,
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
    });
    expect(node.confidence).toBeNull();
    expect(node.weight).toBeCloseTo(0.5);
  });
});

describe("normalizeMemoryNode", () => {
  it("prefers summary over truncated content", () => {
    const node = normalizeMemoryNode({
      id: "m1",
      type: "episodic",
      content: "a very long content".repeat(20),
      summary: "A short summary",
      importance: 80,
      confidence: 0.9,
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
      occurredAt: null,
      validFrom: null,
      validUntil: null,
    });
    expect(node.label).toBe("A short summary");
    expect(node.type).toBe("episodic");
    expect(node.kind).toBe("memory");
  });

  it("truncates long content when no summary", () => {
    const long = "x".repeat(300);
    const node = normalizeMemoryNode({
      id: "m1",
      type: "semantic",
      content: long,
      summary: null,
      importance: 50,
      confidence: 0.5,
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
    });
    expect(node.label.length).toBeLessThan(200);
    expect(node.label.endsWith("…")).toBe(true);
  });

  it("weights by importance and confidence", () => {
    const high = normalizeMemoryNode({
      id: "m1",
      type: "semantic",
      content: "c",
      summary: null,
      importance: 100,
      confidence: 1,
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
    });
    expect(high.weight).toBeCloseTo(1);
    const low = normalizeMemoryNode({
      id: "m2",
      type: "semantic",
      content: "c",
      summary: null,
      importance: 0,
      confidence: 0,
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
    });
    expect(low.weight).toBeCloseTo(0);
  });
});

describe("clamp01", () => {
  it("clamps to [0,1]", () => {
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(2)).toBe(1);
    expect(clamp01(0.5)).toBe(0.5);
    expect(clamp01(NaN)).toBe(0);
  });
});

describe("isDirected", () => {
  it("returns true for directed relationship types", () => {
    expect(isDirected("works_on")).toBe(true);
    expect(isDirected("replaced_by")).toBe(true);
    expect(isDirected("located_in")).toBe(true);
  });
  it("returns false for undirected types", () => {
    expect(isDirected("related_to")).toBe(false);
    expect(isDirected("shares_entity")).toBe(false);
  });
});

describe("nodeExistsAt", () => {
  it("returns false before createdAt", () => {
    const node = makeNode({ createdAt: "2025-06-01T00:00:00.000Z" });
    expect(nodeExistsAt(node, "2025-01-01T00:00:00.000Z")).toBe(false);
  });
  it("returns true after createdAt with no validity window", () => {
    const node = makeNode({ createdAt: "2025-01-01T00:00:00.000Z" });
    expect(nodeExistsAt(node, "2025-06-01T00:00:00.000Z")).toBe(true);
  });
  it("respects validFrom/validUntil", () => {
    const node = makeNode({
      createdAt: "2025-01-01T00:00:00.000Z",
      validFrom: "2025-03-01T00:00:00.000Z",
      validUntil: "2025-09-01T00:00:00.000Z",
    });
    expect(nodeExistsAt(node, "2025-02-01T00:00:00.000Z")).toBe(false);
    expect(nodeExistsAt(node, "2025-05-01T00:00:00.000Z")).toBe(true);
    expect(nodeExistsAt(node, "2025-10-01T00:00:00.000Z")).toBe(false);
  });
  it("treats unparseable dates as always existed", () => {
    const node = makeNode({ createdAt: "not-a-date" });
    expect(nodeExistsAt(node, "2025-01-01T00:00:00.000Z")).toBe(true);
  });
});

describe("dropDisconnectedNodes", () => {
  it("removes isolated nodes and dangling edges", () => {
    const nodes = [makeNode({ id: "memory:a" }), makeNode({ id: "memory:b" }), makeNode({ id: "memory:c" })];
    const edges = [makeEdge({ source: "memory:a", target: "memory:b" })];
    const { nodes: keptNodes, edges: keptEdges } = dropDisconnectedNodes(nodes, edges);
    expect(keptNodes.map((n) => n.id).sort()).toEqual(["memory:a", "memory:b"]);
    expect(keptEdges).toHaveLength(1);
  });
});

describe("detectClusters", () => {
  it("groups connected components and counts isolated nodes", () => {
    const nodes = [
      makeNode({ id: "memory:a" }),
      makeNode({ id: "memory:b" }),
      makeNode({ id: "memory:c" }),
      makeNode({ id: "memory:d" }),
      makeNode({ id: "memory:e" }),
    ];
    const edges = [
      makeEdge({ source: "memory:a", target: "memory:b" }),
      makeEdge({ source: "memory:b", target: "memory:c" }),
      makeEdge({ source: "memory:d", target: "memory:e" }),
    ];
    const { clusters, isolated } = detectClusters(nodes, edges);
    expect(isolated).toBe(1);
    expect(clusters[0].size).toBeGreaterThanOrEqual(2);
    expect(clusters.reduce((s, c) => s + c.size, 0)).toBe(4);
  });
  it("all nodes isolated when no edges", () => {
    const nodes = [makeNode({ id: "memory:a" }), makeNode({ id: "memory:b" })];
    const { clusters, isolated } = detectClusters(nodes, []);
    expect(isolated).toBe(2);
    expect(clusters).toHaveLength(2);
    expect(clusters.every((c) => c.size === 1)).toBe(true);
  });
});

describe("CSV builders", () => {
  it("builds node CSV with header and quoted label", () => {
    const nodes = [makeNode({ label: 'Ada, "the" engineer' })];
    const csv = buildCsvNodes(nodes);
    expect(csv.split("\n")[0]).toBe("id,kind,type,label,importance,weight,confidence,createdAt");
    expect(csv).toContain('"Ada, ""the"" engineer"');
  });
  it("builds edge CSV with header", () => {
    const edges = [makeEdge()];
    const csv = buildCsvEdges(edges);
    expect(csv.split("\n")[0]).toBe("id,source,target,type,directed,strength,confidence,createdAt");
    expect(csv).toContain('"rel:r1","memory:m1","memory:m2","related_to",false,0.6000,0.6');
  });
});
