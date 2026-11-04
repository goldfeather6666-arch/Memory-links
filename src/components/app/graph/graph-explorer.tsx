"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/app/icons";
import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";
import { detectWebGL } from "@/components/three/webgl-provider";
import { Graph2D } from "./graph-2d";
import { Universe3D } from "./universe-3d";
import { NodeDetail } from "./node-detail";
import { GraphDashboard } from "./graph-dashboard";
import {
  nodeExistsAt,
  type GraphEdgeData,
  type GraphNodeData,
} from "./layout";

type Mode = "universe" | "project" | "person" | "topic" | "timeline" | "focus";

const MODES: { id: Mode; label: string }[] = [
  { id: "universe", label: "Universe" },
  { id: "project", label: "Project" },
  { id: "person", label: "Person" },
  { id: "topic", label: "Topic" },
  { id: "timeline", label: "Timeline" },
  { id: "focus", label: "Focus" },
];

interface GraphMetrics {
  totalEntities: number;
  totalActiveMemories: number;
  totalRelationships: number;
  entityCategoryCounts: { type: string; count: number }[];
  memoryTypeCounts: { type: string; count: number }[];
  growth: { month: string; nodes: number }[];
  recentEdges: {
    id: string;
    source: string;
    target: string;
    type: string;
    createdAt: string;
  }[];
}

interface GraphExplorerProps {
  workspaceId: string;
  initialMetrics: GraphMetrics | null;
}

interface Projection {
  nodes: GraphNodeData[];
  edges: GraphEdgeData[];
  truncated: { nodes: boolean; edges: boolean };
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init });
  if (!res.ok) throw new Error((await res.text().catch(() => res.statusText)));
  return res.json() as Promise<T>;
}

export function GraphExplorer({ workspaceId, initialMetrics }: GraphExplorerProps) {
  const reducedMotion = useReducedMotion();
  const [webgl] = useState(() =>
    typeof window === "undefined" ? true : detectWebGL(),
  );

  const [mode, setMode] = useState<Mode>("universe");
  const [topic, setTopic] = useState("");
  const [focusId, setFocusId] = useState<string | null>(null);
  const [focusKind, setFocusKind] = useState<"memory" | "entity">("entity");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [nodeTypes, setNodeTypes] = useState<string[]>([]);
  const [relationshipTypes, setRelationshipTypes] = useState<string[]>([]);
  const [minImportance, setMinImportance] = useState(20);
  const [minConfidence, setMinConfidence] = useState(0.3);
  const [hideDisconnected, setHideDisconnected] = useState(true);
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [timelineAt, setTimelineAt] = useState<string | null>(null);

  const [projection, setProjection] = useState<Projection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showDashboard, setShowDashboard] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<GraphNodeData[]>([]);
  const [snapshotName, setSnapshotName] = useState("");
  const [snapshots, setSnapshots] = useState<{ id: string; name: string; mode: string }[]>([]);
  const [snapshotMsg, setSnapshotMsg] = useState<string | null>(null);

  const qs = useMemo(() => {
    const p = new URLSearchParams({ ws: workspaceId, mode });
    if (mode === "project" && projectId) p.set("projectId", projectId);
    if (mode === "person" && focusId) p.set("focusId", focusId);
    if (mode === "focus" && focusId) {
      p.set("focusId", focusId);
      p.set("focusKind", focusKind);
    }
    if ((mode === "topic" || mode === "timeline") && topic.trim()) p.set("topic", topic.trim());
    if (nodeTypes.length) p.set("nodeTypes", nodeTypes.join(","));
    if (relationshipTypes.length) p.set("relationshipTypes", relationshipTypes.join(","));
    p.set("minImportance", String(minImportance));
    p.set("minConfidence", String(minConfidence));
    p.set("hideDisconnected", String(hideDisconnected));
    if (mode === "timeline" && from) p.set("from", from);
    if (mode === "timeline" && to) p.set("to", to);
    return p.toString();
  }, [workspaceId, mode, projectId, focusId, focusKind, topic, nodeTypes, relationshipTypes, minImportance, minConfidence, hideDisconnected, from, to]);

  const loadProjection = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchJson<Projection>(`/api/v1/graph?${qs}`);
      setProjection(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load graph");
    } finally {
      setLoading(false);
    }
  }, [qs]);

  useEffect(() => {
    void loadProjection();
  }, [loadProjection]);

  const visible = useMemo(() => {
    if (!projection) return { nodes: [], edges: [] };
    if (!timelineAt) return { nodes: projection.nodes, edges: projection.edges };
    const nodes = projection.nodes.filter((n) => nodeExistsAt(n, timelineAt));
    const ids = new Set(nodes.map((n) => n.id));
    const edges = projection.edges.filter(
      (e) => ids.has(e.source) && ids.has(e.target),
    );
    return { nodes, edges };
  }, [projection, timelineAt]);

  const selectedNode = useMemo(
    () => visible.nodes.find((n) => n.id === selectedId) ?? null,
    [visible.nodes, selectedId],
  );

  const runSearch = useCallback(async () => {
    const q = searchQ.trim();
    if (!q) return;
    try {
      const data = await fetchJson<{ results: GraphNodeData[] }>(
        `/api/v1/graph/search?ws=${workspaceId}&q=${encodeURIComponent(q)}`,
      );
      setSearchResults(data.results);
    } catch {
      setSearchResults([]);
    }
  }, [searchQ, workspaceId]);

  const pickSearchResult = (node: GraphNodeData) => {
    setSearchResults([]);
    setSearchQ("");
    setFocusId(node.id.split(":")[1] ?? node.id);
    setFocusKind(node.kind);
    setMode("focus");
    setSelectedId(node.id);
  };

  const saveSnapshot = async () => {
    if (!projection || !snapshotName.trim()) return;
    try {
      await fetchJson<{ id: string }>(
        `/api/v1/graph/snapshots?ws=${workspaceId}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: snapshotName.trim(),
            mode,
            nodeIds: projection.nodes.map((n) => n.id.split(":")[1] ?? n.id),
            edgeIds: projection.edges.map((e) => e.id),
            filter: { mode, nodeTypes, relationshipTypes },
          }),
        },
      );
      setSnapshotName("");
      setSnapshotMsg("Snapshot saved.");
      window.setTimeout(() => setSnapshotMsg(null), 2500);
    } catch {
      setSnapshotMsg("Could not save snapshot.");
    }
  };

  const loadSnapshots = useCallback(async () => {
    try {
      const data = await fetchJson<{ id: string; name: string; mode: string }[]>(
        `/api/v1/graph/snapshots?ws=${workspaceId}`,
      );
      setSnapshots(data);
    } catch {
      /* keep empty */
    }
  }, [workspaceId]);

  useEffect(() => {
    void loadSnapshots();
  }, [loadSnapshots]);

  const handleExport = async (format: "json" | "nodes-csv" | "edges-csv") => {
    const res = await fetch(`/api/v1/graph/export?ws=${workspaceId}&format=${format}`);
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `graph-${format}.${format === "json" ? "json" : "csv"}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const renderEngine = reducedMotion || !webgl;

  const onExplore = (node: GraphNodeData) => {
    setFocusId(node.id.split(":")[1] ?? node.id);
    setFocusKind(node.kind);
    setMode("focus");
  };

  const onHide = (node: GraphNodeData) => {
    if (!projection) return;
    const ids = new Set(visible.nodes.map((n) => n.id));
    ids.delete(node.id);
    const nodes = visible.nodes.filter((n) => n.id !== node.id);
    const edges = visible.edges.filter(
      (e) => e.source !== node.id && e.target !== node.id,
    );
    void ids;
    setProjection({ nodes, edges, truncated: projection.truncated });
    setSelectedId(null);
  };

  const toggleNodeType = (t: string) => {
    setNodeTypes((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t],
    );
  };

  const toggleRelType = (t: string) => {
    setRelationshipTypes((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t],
    );
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Mode selector */}
      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Exploration mode">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={mode === m.id}
            onClick={() => setMode(m.id)}
            className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet ${
              mode === m.id
                ? "border-violet/50 bg-violet/20 text-soft-white"
                : "border-soft-white/10 text-slate hover:bg-soft-white/10 hover:text-soft-white"
            }`}
          >
            {m.label}
          </button>
        ))}
        <div className="ml-auto flex gap-2">
          <Button type="button" size="sm" variant="secondary" onClick={() => setShowDashboard((s) => !s)}>
            {showDashboard ? "Graph" : "Dashboard"}
          </Button>
        </div>
      </div>

      {/* Mode-specific inputs */}
      {(mode === "topic" || mode === "timeline") && (
        <div className="flex max-w-md gap-2">
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder={mode === "topic" ? "Topic…" : "Filter by topic…"}
            aria-label="Topic filter"
            className="w-full rounded-lg border border-soft-white/10 bg-midnight/40 px-3 py-1.5 text-sm text-soft-white placeholder:text-slate focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet"
          />
          {mode === "timeline" && (
            <>
              <input
                type="date"
                value={from ?? ""}
                onChange={(e) => setFrom(e.target.value || null)}
                aria-label="From date"
                className="rounded-lg border border-soft-white/10 bg-midnight/40 px-3 py-1.5 text-sm text-soft-white focus-visible:outline-violet"
              />
              <input
                type="date"
                value={to ?? ""}
                onChange={(e) => setTo(e.target.value || null)}
                aria-label="To date"
                className="rounded-lg border border-soft-white/10 bg-midnight/40 px-3 py-1.5 text-sm text-soft-white focus-visible:outline-violet"
              />
            </>
          )}
        </div>
      )}

      {/* Search */}
      <div className="relative max-w-md">
        <input
          value={searchQ}
          onChange={(e) => setSearchQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void runSearch();
          }}
          placeholder="Search entities and memories…"
          aria-label="Search graph"
          className="w-full rounded-lg border border-soft-white/10 bg-midnight/40 px-3 py-1.5 pr-24 text-sm text-soft-white placeholder:text-slate focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet"
        />
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => void runSearch()}
          className="absolute right-1.5 top-1/2 -translate-y-1/2"
        >
          <Icon name="search" size={14} />
        </Button>
        {searchResults.length > 0 && (
          <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-soft-white/10 bg-obsidian shadow-2xl">
            {searchResults.map((node) => (
              <li key={node.id}>
                <button
                  type="button"
                  onClick={() => pickSearchResult(node)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-soft-white hover:bg-soft-white/10"
                >
                  <span className="truncate">{node.label}</span>
                  <Badge variant="subtle">{node.kind}</Badge>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Filters */}
      <details className="rounded-xl border border-soft-white/10 bg-midnight/20 p-3">
        <summary className="cursor-pointer text-sm font-medium text-soft-white">Filters</summary>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate">Node types</div>
            <div className="flex flex-wrap gap-1.5">
              {["person", "organization", "product", "project", "location", "technology", "event", "concept", "episodic", "semantic", "procedural", "associative"].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggleNodeType(t)}
                  className={`rounded-md border px-2 py-0.5 text-xs ${
                    nodeTypes.includes(t)
                      ? "border-violet/50 bg-violet/20 text-soft-white"
                      : "border-soft-white/10 text-slate hover:bg-soft-white/10"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate">Relationship types</div>
            <div className="flex flex-wrap gap-1.5">
              {["references", "works_on", "owns", "uses", "created", "related_to", "depends_on", "replaced_by", "participated_in", "decided", "located_in", "shares_entity"].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggleRelType(t)}
                  className={`rounded-md border px-2 py-0.5 text-xs ${
                    relationshipTypes.includes(t)
                      ? "border-violet/50 bg-violet/20 text-soft-white"
                      : "border-soft-white/10 text-slate hover:bg-soft-white/10"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-xs text-slate">
              Min importance
              <input
                type="range"
                min={0}
                max={100}
                value={minImportance}
                onChange={(e) => setMinImportance(Number(e.target.value))}
                className="accent-violet"
              />
              <span className="text-soft-white">{minImportance}</span>
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate">
              Min confidence
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={minConfidence}
                onChange={(e) => setMinConfidence(Number(e.target.value))}
                className="accent-violet"
              />
              <span className="text-soft-white">{minConfidence.toFixed(2)}</span>
            </label>
            <label className="flex items-center gap-2 text-xs text-slate">
              <input
                type="checkbox"
                checked={hideDisconnected}
                onChange={(e) => setHideDisconnected(e.target.checked)}
                className="accent-violet"
              />
              Hide disconnected nodes
            </label>
          </div>
        </div>
      </details>

      {/* Timeline slider */}
      {mode === "timeline" && projection && projection.nodes.length > 0 && (
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium uppercase tracking-wide text-slate">
            Point in time
          </label>
          <input
            type="range"
            min={Math.min(...projection.nodes.map((n) => Date.parse(n.createdAt) || 0))}
            max={Date.now()}
            value={timelineAt ? Date.parse(timelineAt) : Date.now()}
            onChange={(e) => setTimelineAt(new Date(Number(e.target.value)).toISOString())}
            className="accent-violet"
          />
          <span className="text-xs text-slate">
            {timelineAt ? new Date(timelineAt).toLocaleDateString() : "Present"}
          </span>
        </div>
      )}

      {/* Snapshot controls */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={snapshotName}
          onChange={(e) => setSnapshotName(e.target.value)}
          placeholder="Snapshot name…"
          aria-label="Snapshot name"
          className="rounded-lg border border-soft-white/10 bg-midnight/40 px-3 py-1.5 text-sm text-soft-white placeholder:text-slate focus-visible:outline-violet"
        />
        <Button type="button" size="sm" variant="secondary" onClick={() => void saveSnapshot()}>
          Save snapshot
        </Button>
        {snapshotMsg && (
          <span role="status" className="text-xs text-emerald-300">{snapshotMsg}</span>
        )}
        <div className="ml-auto flex gap-2">
          <Button type="button" size="sm" variant="secondary" onClick={() => void handleExport("json")}>
            Export JSON
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => void handleExport("nodes-csv")}>
            Nodes CSV
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => void handleExport("edges-csv")}>
            Edges CSV
          </Button>
        </div>
      </div>

      {snapshots.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate">Saved snapshots:</span>
          {snapshots.map((s) => (
            <Badge key={s.id} variant="subtle">{s.name}</Badge>
          ))}
        </div>
      )}

      {/* Main area */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_340px]">
        <div className="min-h-[480px]">
          {loading ? (
            <div className="flex h-full min-h-[480px] items-center justify-center rounded-2xl border border-soft-white/10 bg-midnight/40">
              <p className="text-sm text-slate">Loading graph…</p>
            </div>
          ) : error ? (
            <div className="flex h-full min-h-[480px] items-center justify-center rounded-2xl border border-red-500/20 bg-red-500/5">
              <p className="text-sm text-red-300">{error}</p>
            </div>
          ) : visible.nodes.length === 0 ? (
            <EmptyState
              icon={<Icon name="graph" size={24} />}
              title="No graph data yet"
              description="Ingest memories and run entity enrichment to populate the graph."
            />
          ) : (
            <div className="h-full">
              {renderEngine ? (
                <Graph2D
                  nodes={visible.nodes}
                  edges={visible.edges}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                />
              ) : (
                <Universe3D
                  nodes={visible.nodes}
                  edges={visible.edges}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                />
              )}
            </div>
          )}
        </div>

        {selectedNode && !showDashboard && (
          <NodeDetail
            node={selectedNode}
            edges={visible.edges}
            onExplore={onExplore}
            onHide={onHide}
          />
        )}

        {showDashboard && (
          <div className="lg:col-span-2">
            <GraphDashboard metrics={initialMetrics} nodes={visible.nodes} edges={visible.edges} />
          </div>
        )}
      </div>
    </div>
  );
}
