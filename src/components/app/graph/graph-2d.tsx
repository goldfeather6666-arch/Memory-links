"use client";

import { useMemo, useState, type KeyboardEvent } from "react";
import {
  entityColor,
  entityLabel,
  relaxNodes,
  seedPositions,
  type GraphEdgeData,
  type GraphNodeData,
} from "./layout";

interface Graph2DProps {
  nodes: GraphNodeData[];
  edges: GraphEdgeData[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

const EDGE_COLOR = "#5a6b8c";
const EDGE_HIGHLIGHT = "#b7aaff";
const PADDING = 40;
const FOCUS_RING = "#f0edff";

export function Graph2D({ nodes, edges, selectedId, onSelect }: Graph2DProps) {
  // Seed once, then relax over the fetched node/edge set.
  const positions = useMemo(() => {
    const seed = seedPositions(nodes, 2);
    return relaxNodes(nodes, edges, seed, 120);
  }, [nodes, edges]);

  const bounds = useMemo(() => {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const node of nodes) {
      const p = positions.get(node.id);
      if (!p) continue;
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    if (nodes.length === 0) {
      minX = -10;
      maxX = 10;
      minY = -10;
      maxY = 10;
    }
    return { minX, maxX, minY, maxY };
  }, [nodes, positions]);

  const width = Math.max(bounds.maxX - bounds.minX + PADDING * 2, 200);
  const height = Math.max(bounds.maxY - bounds.minY + PADDING * 2, 200);
  const viewBox = `${bounds.minX - PADDING} ${bounds.minY - PADDING} ${width} ${height}`;

  // Connected edge index set for the selected node.
  const connectedEdgeIds = useMemo(() => {
    const set = new Set<number>();
    if (!selectedId) return set;
    for (let i = 0; i < edges.length; i++) {
      const e = edges[i];
      if (e.source === selectedId || e.target === selectedId) set.add(i);
    }
    return set;
  }, [edges, selectedId]);

  const adjacentNodeIds = useMemo(() => {
    const set = new Set<string>();
    if (!selectedId) return set;
    for (const e of edges) {
      if (e.source === selectedId) set.add(e.target);
      else if (e.target === selectedId) set.add(e.source);
    }
    return set;
  }, [edges, selectedId]);

  // Keyboard navigation: arrow keys move a focus ring through nodes; Enter /
  // Space selects the focused node. The ring is a visual affordance separate
  // from (but coordinated with) the selection.
  const [focusIndex, setFocusIndex] = useState(0);

  const handleKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    const key = event.key;
    if (key === "ArrowRight" || key === "ArrowDown") {
      event.preventDefault();
      setFocusIndex((i) => (i + 1) % Math.max(nodes.length, 1));
    } else if (key === "ArrowLeft" || key === "ArrowUp") {
      event.preventDefault();
      setFocusIndex((i) => (i - 1 + nodes.length) % Math.max(nodes.length, 1));
    } else if (key === "Enter" || key === " ") {
      event.preventDefault();
      const node = nodes[focusIndex];
      if (node) onSelect(selectedId === node.id ? null : node.id);
    }
  };

  const distinctTypes = useMemo(() => {
    const seen = new Set<string>();
    for (const node of nodes) seen.add(node.type);
    return Array.from(seen);
  }, [nodes]);

  return (
    <div className="flex h-full min-h-[480px] flex-col gap-3">
      <svg
        role="img"
        aria-label="Knowledge graph 2D view"
        tabIndex={0}
        viewBox={viewBox}
        className="h-full w-full rounded-2xl border border-soft-white/10 bg-midnight/40 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet"
        onKeyDown={handleKeyDown}
        aria-describedby="graph2d-help"
      >
        <title>Knowledge graph 2D view</title>

        {/* Edges */}
        {edges.map((edge, i) => {
          const a = positions.get(edge.source);
          const b = positions.get(edge.target);
          if (!a || !b) return null;
          const isConnected = connectedEdgeIds.has(i);
          const opacity = isConnected
            ? 0.95
            : 0.22 + edge.strength * 0.6;
          return (
            <line
              key={`${edge.source}-${edge.target}-${i}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={isConnected ? EDGE_HIGHLIGHT : EDGE_COLOR}
              strokeOpacity={opacity}
              strokeWidth={isConnected ? 2 : 1}
            />
          );
        })}

        {/* Nodes */}
        {nodes.map((node, i) => {
          const p = positions.get(node.id);
          if (!p) return null;
          const radius = 4 + node.weight * 10;
          const isSelected = node.id === selectedId;
          const isFocused = i === focusIndex;
          const isDimmed = selectedId !== null && !isSelected && !adjacentNodeIds.has(node.id);
          return (
            <g
              key={node.id}
              transform={`translate(${p.x} ${p.y})`}
              style={{ cursor: "pointer" }}
              onClick={() => onSelect(isSelected ? null : node.id)}
              role="button"
              aria-label={node.label}
              tabIndex={-1}
            >
              {isFocused && !isSelected && (
                <circle
                  r={radius + 5}
                  fill="none"
                  stroke={FOCUS_RING}
                  strokeWidth={1.5}
                  strokeDasharray="3 3"
                />
              )}
              <circle
                r={radius}
                fill={entityColor(node.type)}
                fillOpacity={isDimmed ? 0.16 : isSelected ? 1 : 0.85}
                stroke={isSelected ? "#ffffff" : entityColor(node.type)}
                strokeWidth={isSelected ? 2.5 : 1}
              />
              <title>{`${node.label} — ${entityLabel(node.type)}`}</title>
            </g>
          );
        })}
      </svg>

      <p id="graph2d-help" className="sr-only">
        Use arrow keys to move focus between nodes; press Enter or Space to select a node.
      </p>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-1" aria-label="Legend">
        {distinctTypes.map((type) => (
          <span key={type} className="inline-flex items-center gap-1.5 text-xs text-slate">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: entityColor(type) }}
            />
            {entityLabel(type)}
          </span>
        ))}
      </div>
    </div>
  );
}
