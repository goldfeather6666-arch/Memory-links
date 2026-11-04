"use client";

import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { detectClusters, type GraphEdgeData, type GraphNodeData } from "./layout";

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

interface GraphDashboardProps {
  metrics: GraphMetrics | null;
  nodes: GraphNodeData[];
  edges: GraphEdgeData[];
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-soft-white/10 bg-midnight/40 px-4 py-3">
      <div className="text-[10px] font-medium uppercase tracking-wide text-slate">
        {label}
      </div>
      <div className="mt-0.5 text-xl font-semibold text-soft-white">{value}</div>
    </div>
  );
}

export function GraphDashboard({ metrics, nodes, edges }: GraphDashboardProps) {
  const clusters = useMemo(() => detectClusters(nodes, edges), [nodes, edges]);
  const largest = clusters.clusters[0]?.size ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Entities" value={String(metrics?.totalEntities ?? nodes.filter((n) => n.kind === "entity").length)} />
        <Tile label="Active memories" value={String(metrics?.totalActiveMemories ?? nodes.filter((n) => n.kind === "memory").length)} />
        <Tile label="Relationships" value={String(metrics?.totalRelationships ?? edges.length)} />
        <Tile label="Largest cluster" value={String(largest)} />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card className="flex flex-col gap-3 p-4">
          <h3 className="text-sm font-semibold text-soft-white">Isolated nodes</h3>
          <p className="text-3xl font-semibold text-soft-white">{clusters.isolated}</p>
          <p className="text-xs text-slate">
            Nodes with no connections in the current view.
          </p>
        </Card>

        <Card className="flex flex-col gap-3 p-4">
          <h3 className="text-sm font-semibold text-soft-white">Top clusters</h3>
          {clusters.clusters.length === 0 ? (
            <p className="text-xs text-slate">No clusters to show.</p>
          ) : (
            <ul className="space-y-1.5">
              {clusters.clusters.slice(0, 5).map((c) => (
                <li key={c.id} className="flex items-center justify-between text-sm text-slate">
                  <span className="truncate">{c.id}</span>
                  <Badge variant="subtle">{c.size}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="flex flex-col gap-3 p-4">
        <h3 className="text-sm font-semibold text-soft-white">Entity categories</h3>
        {(metrics?.entityCategoryCounts ?? []).length === 0 ? (
          <p className="text-xs text-slate">No entities yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {(metrics?.entityCategoryCounts ?? []).map((c) => (
              <Badge key={c.type} variant="violet">
                {c.type} · {c.count}
              </Badge>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
