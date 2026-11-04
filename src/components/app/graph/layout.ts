"use client";

/**
 * Client-safe graph utilities shared by the 2D / 3D renderers and the
 * explorer/dashboard. Mirrors the server-side GraphNode/GraphEdge shapes so
 * the renderers can use fetched projection data directly.
 */

export interface GraphNodeData {
  id: string;
  kind: "memory" | "entity";
  type: string;
  label: string;
  subtitle: string | null;
  importance: number;
  weight: number;
  confidence: number | null;
  createdAt: string;
  updatedAt: string;
  occurredAt: string | null;
  validFrom: string | null;
  validUntil: string | null;
}

export interface GraphEdgeData {
  id: string;
  source: string;
  target: string;
  type: string;
  directed: boolean;
  strength: number;
  confidence: number | null;
  createdAt: string;
}

const ENTITY_COLORS: Record<string, string> = {
  person: "#a78bfa",
  organization: "#38bdf8",
  product: "#34d399",
  project: "#f472b6",
  location: "#fb923c",
  technology: "#22d3ee",
  event: "#facc15",
  concept: "#94a3b8",
};

export const MEMORY_COLOR = "#6366f1";

export function entityColor(type: string): string {
  return ENTITY_COLORS[type] ?? "#94a3b8";
}

const ENTITY_LABELS: Record<string, string> = {
  person: "Person",
  organization: "Organization",
  product: "Product",
  project: "Project",
  location: "Location",
  technology: "Technology",
  event: "Event",
  concept: "Concept",
};

export function entityLabel(type: string): string {
  return ENTITY_LABELS[type] ?? type;
}

const ROLE_LABELS: Record<string, string> = {
  references: "references",
  works_on: "works on",
  owns: "owns",
  uses: "uses",
  created: "created",
  related_to: "related to",
  depends_on: "depends on",
  replaced_by: "replaced by",
  participated_in: "participated in",
  decided: "decided",
  located_in: "located in",
  shares_entity: "shares entity",
};

export function roleLabel(type: string): string {
  return ROLE_LABELS[type] ?? type;
}

type Vec3 = { x: number; y: number; z: number };

export function seedPositions(
  nodes: { id: string; weight: number }[],
  dim: 2 | 3,
): Map<string, Vec3> {
  const map = new Map<string, Vec3>();
  nodes.forEach((n, i) => {
    const weight = Number.isFinite(n.weight) ? n.weight : 0.5;
    const angle = (i / Math.max(nodes.length, 1)) * Math.PI * 2;
    const radius = 3 + weight * 9;
    const jitter = ((i * 9301 + 49297) % 233280) / 233280;
    const x = Math.cos(angle + jitter) * radius;
    const y = Math.sin(angle + jitter) * radius;
    const z = dim === 3 ? (jitter - 0.5) * 4 : 0;
    map.set(n.id, { x, y, z });
  });
  return map;
}

export function relaxNodes(
  nodes: { id: string; weight: number }[],
  edges: { source: string; target: string }[],
  initial: Map<string, Vec3>,
  iterations = 120,
): Map<string, Vec3> {
  const pos = new Map<string, Vec3>();
  const vel = new Map<string, Vec3>();
  for (const n of nodes) {
    const p = initial.get(n.id) ?? { x: 0, y: 0, z: 0 };
    pos.set(n.id, { ...p });
    vel.set(n.id, { x: 0, y: 0, z: 0 });
  }

  const repulsion = 240;
  const spring = 0.06;
  const restLength = 2.4;
  const damping = 0.86;

  for (let step = 0; step < iterations; step++) {
    // Repulsion: all pairs.
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = pos.get(nodes[i].id);
        const b = pos.get(nodes[j].id);
        if (!a || !b) continue;
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let dz = a.z - b.z;
        const distSq = dx * dx + dy * dy + dz * dz + 0.01;
        const dist = Math.sqrt(distSq);
        const force = repulsion / distSq;
        dx /= dist;
        dy /= dist;
        dz /= dist;
        const va = vel.get(nodes[i].id)!;
        const vb = vel.get(nodes[j].id)!;
        va.x += dx * force;
        va.y += dy * force;
        va.z += dz * force;
        vb.x -= dx * force;
        vb.y -= dy * force;
        vb.z -= dz * force;
      }
    }
    // Springs on edges.
    for (const e of edges) {
      const a = pos.get(e.source);
      const b = pos.get(e.target);
      const va = vel.get(e.source);
      const vb = vel.get(e.target);
      if (!a || !b || !va || !vb) continue;
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let dz = b.z - a.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.01;
      const force = (dist - restLength) * spring;
      dx /= dist;
      dy /= dist;
      dz /= dist;
      va.x += dx * force;
      va.y += dy * force;
      va.z += dz * force;
      vb.x -= dx * force;
      vb.y -= dy * force;
      vb.z -= dz * force;
    }
    // Integrate + damp.
    for (const n of nodes) {
      const p = pos.get(n.id)!;
      const v = vel.get(n.id)!;
      p.x += v.x;
      p.y += v.y;
      p.z += v.z;
      v.x *= damping;
      v.y *= damping;
      v.z *= damping;
    }
  }
  return pos;
}

export function nodeExistsAt(node: GraphNodeData, atIso: string): boolean {
  const at = Date.parse(atIso);
  if (Number.isNaN(at)) return true;
  const created = Date.parse(node.createdAt);
  if (!Number.isNaN(created) && at < created) return false;
  if (node.validFrom) {
    const vf = Date.parse(node.validFrom);
    if (!Number.isNaN(vf) && at < vf) return false;
  }
  if (node.validUntil) {
    const vu = Date.parse(node.validUntil);
    if (!Number.isNaN(vu) && at > vu) return false;
  }
  return true;
}

export function dropDisconnectedNodes(
  nodes: GraphNodeData[],
  edges: GraphEdgeData[],
): { nodes: GraphNodeData[]; edges: GraphEdgeData[] } {
  const degree = new Map<string, number>();
  for (const n of nodes) degree.set(n.id, 0);
  for (const e of edges) {
    if (degree.has(e.source)) degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
    if (degree.has(e.target)) degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
  }
  const alive = new Set<string>();
  for (const n of nodes) if ((degree.get(n.id) ?? 0) > 0) alive.add(n.id);
  return {
    nodes: nodes.filter((n) => alive.has(n.id)),
    edges: edges.filter((e) => alive.has(e.source) && alive.has(e.target)),
  };
}

export function detectClusters(
  nodes: GraphNodeData[],
  edges: GraphEdgeData[],
): { clusters: { id: string; size: number }[]; isolated: number } {
  const parent = new Map<string, string>();
  for (const n of nodes) parent.set(n.id, n.id);
  const find = (x: string): string => {
    if (parent.get(x) !== x) parent.set(x, find(parent.get(x)!));
    return parent.get(x)!;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(rb, ra);
  };
  const incident = new Set<string>();
  for (const e of edges) {
    if (parent.has(e.source) && parent.has(e.target)) {
      union(e.source, e.target);
      incident.add(e.source);
      incident.add(e.target);
    } else {
      if (parent.has(e.source)) incident.add(e.source);
      if (parent.has(e.target)) incident.add(e.target);
    }
  }
  const size = new Map<string, number>();
  for (const n of nodes) {
    const root = find(n.id);
    size.set(root, (size.get(root) ?? 0) + 1);
  }
  const clusters = Array.from(size.entries())
    .map(([id, sz]) => ({ id, size: sz }))
    .sort((a, b) => b.size - a.size);
  let isolated = 0;
  for (const n of nodes) if (!incident.has(n.id)) isolated++;
  return { clusters, isolated };
}
