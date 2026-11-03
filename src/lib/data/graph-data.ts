/**
 * graph-data.ts — deterministic sample dataset for the interactive knowledge graph.
 *
 * Everything is generated from a fixed seed so node positions, labels and links
 * are stable across reloads and builds. Purely procedural — no external assets,
 * no network calls, no runtime randomness.
 */

export type GraphCategory =
  | 'projects'
  | 'people'
  | 'decisions'
  | 'research'
  | 'notes'
  | 'tools';

export interface GraphNode {
  id: number;
  category: GraphCategory;
  label: string;
  x: number;
  y: number;
  z: number;
  /** 0..1 relative visual mass (radius / point size). */
  weight: number;
}

export interface GraphEdge {
  source: number;
  target: number;
  /** 0..1 link strength (opacity / width when rendered). */
  strength: number;
}

export const CATEGORY_LABEL: Record<GraphCategory, string> = {
  projects: 'Projects',
  people: 'People',
  decisions: 'Decisions',
  research: 'Research',
  notes: 'Notes',
  tools: 'Tools',
};

/** Per-category color tokens shared by the 3D scenes and HTML overlays. */
export const CATEGORY_COLOR: Record<GraphCategory, string> = {
  projects: '#8B5CF6', // violet
  people: '#38BDF8', // neural-blue
  decisions: '#E3C98D', // champagne
  research: '#94A3B8', // slate
  notes: '#F5F1EA', // soft-white
  tools: '#7C6FF0', // secondary violet (palette extension for the 6th category)
};

/** Category order used for legend / layout. */
export const CATEGORY_ORDER: GraphCategory[] = [
  'projects',
  'people',
  'decisions',
  'research',
  'notes',
  'tools',
];

/** Seeded PRNG (mulberry32) — reproducible dataset. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(20240815);

const pick = <T,>(arr: T[]): T => arr[Math.floor(rng() * arr.length)];

/** Point on/inside a spherical shell centered at (cx, cy, cz). */
function shellPoint(rMin: number, rMax: number, cx = 0, cy = 0, cz = 0) {
  const u = rng() * 2 - 1;
  const theta = rng() * Math.PI * 2;
  const s = Math.sqrt(1 - u * u);
  const r = rMin + (rMax - rMin) * rng();
  return {
    x: cx + r * s * Math.cos(theta),
    y: cy + r * u,
    z: cz + r * s * Math.sin(theta),
  };
}

/** Per-category cluster bias so like items group softly. */
const BIAS: Record<GraphCategory, [number, number, number]> = {
  projects: [1.4, 0.2, 0.5],
  people: [-1.2, -0.4, 0.9],
  decisions: [0.5, 1.5, -0.3],
  research: [-0.8, 0.7, -1.4],
  notes: [0.9, -1.3, -0.6],
  tools: [-1.0, -0.9, 0.8],
};

const LABEL_POOLS: Record<GraphCategory, string[]> = {
  projects: [
    'Helios', 'Meridian', 'Atlas', 'Nexus', 'Vertex', 'Oakline', 'Cinder',
    'Halo', 'Vantage', 'Quartz', 'Lumen', 'Solstice', 'Terra', 'Prism',
    'Ridge', 'Comet', 'Basalt', 'Echo', 'Fathom', 'Grove',
  ],
  people: [
    'Ana', 'Miro', 'Chen', 'Lena', 'Tomas', 'Priya', 'Noah', 'Iris',
    'Felix', 'Sofia', 'Elias', 'Nia', 'Omar', 'June', 'Ari', 'Kai',
    'Mara', 'Sven', 'Yuki', 'Luca',
  ],
  decisions: [
    'Adopt', 'Abandon', 'Defer', 'Approve', 'Reject', 'Align', 'Split',
    'Merge', 'Pivot', 'Scale', 'Deprecate', 'Initialize', 'Prioritize',
    'Freeze', 'Reconsider', 'Accept', 'Defer', 'Assign', 'Sunset', 'Probe',
  ],
  research: [
    'Attention paper', 'Embedding study', 'RLHF analysis', 'Diffusion survey',
    'Multimodal eval', 'Latent probes', 'Alignment taxonomy', 'Scaling law notes',
    'Retrieval benchmark', 'In-context analysis', 'Recall study', 'Memory curves',
    'Interpretability', 'Fine-tune report', 'Benchmark audit', 'Bias eval',
    'Context window', 'Forgetting study', 'Sparse routing', 'Compression survey',
  ],
  notes: [
    'Reflection', 'Reading list', 'Sketch', 'Idea log', 'Meeting notes',
    'Journal', 'Draft', 'Review', 'Brainstorm', 'Rant', 'Outline', 'Clips',
    'Quotes', 'Plan', 'Follow-up', 'Summary', 'Notes', 'Diary', 'Prompt ideas',
    'Migration list',
  ],
  tools: [
    'Tool runner', 'Browser agent', 'Code sandbox', 'Memory store', 'Router',
    'Indexer', 'Summarizer', 'Extractor', 'Retriever', 'Ranker', 'Scraper',
    'Formatter', 'Scheduler', 'Validator', 'Logger', 'Switcher', 'Tagger',
    'Linker', 'Backup', 'Sync',
  ],
};

const COUNTS: Record<GraphCategory, number> = {
  projects: 40,
  people: 35,
  decisions: 30,
  research: 45,
  notes: 45,
  tools: 25,
};

function buildNodes(): GraphNode[] {
  const nodes: GraphNode[] = [];
  let id = 0;
  for (const category of CATEGORY_ORDER) {
    const count = COUNTS[category];
    const [bx, by, bz] = BIAS[category];
    for (let i = 0; i < count; i++) {
      const p = shellPoint(1.6, 2.9, bx, by, bz);
      const label = `${pick(LABEL_POOLS[category])} ${i + 1}`;
      nodes.push({
        id,
        category,
        label,
        x: p.x,
        y: p.y,
        z: p.z,
        weight: 0.5 + rng() * 0.5,
      });
      id += 1;
    }
  }
  return nodes;
}

function buildEdges(nodeCount: number): GraphEdge[] {
  const edges: GraphEdge[] = [];
  for (let i = 0; i < 260; i++) {
    const source = Math.floor(rng() * nodeCount);
    let target = Math.floor(rng() * nodeCount);
    if (target === source) {
      target = (target + 1 + Math.floor(rng() * (nodeCount - 1))) % nodeCount;
    }
    edges.push({ source, target, strength: 0.3 + rng() * 0.7 });
  }
  return edges;
}

export const NODES: GraphNode[] = buildNodes();
export const EDGES: GraphEdge[] = buildEdges(NODES.length);

export const NODE_COUNT = NODES.length;
export const EDGE_COUNT = EDGES.length;

/** Map of category -> array of node ids (handy for legends / filters). */
export const NODES_BY_CATEGORY: Record<GraphCategory, number[]> =
  CATEGORY_ORDER.reduce((acc, category) => {
    acc[category] = NODES.filter((n) => n.category === category).map((n) => n.id);
    return acc;
  }, {} as Record<GraphCategory, number[]>);
