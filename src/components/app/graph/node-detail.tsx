"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/app/icons";
import {
  entityLabel,
  roleLabel,
  type GraphEdgeData,
  type GraphNodeData,
} from "./layout";

interface NodeDetailProps {
  node: GraphNodeData;
  edges: GraphEdgeData[];
  onExplore?: (node: GraphNodeData) => void;
  onHide?: (node: GraphNodeData) => void;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function NodeDetail({ node, edges, onExplore, onHide }: NodeDetailProps) {
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");

  const connected = edges.filter(
    (e) => e.source === node.id || e.target === node.id,
  );
  const incoming = connected.filter((e) => e.target === node.id);
  const outgoing = connected.filter((e) => e.source === node.id);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(node.label);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 1600);
    } catch {
      setCopyState("idle");
    }
  };

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-lg font-semibold text-soft-white">
            {node.label}
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Badge variant="violet">{entityLabel(node.type)}</Badge>
            {node.kind === "memory" && <Badge variant="subtle">Memory</Badge>}
          </div>
        </div>
        <button
          type="button"
          onClick={() => void handleCopy()}
          className="rounded-lg border border-soft-white/10 p-2 text-slate transition-colors hover:bg-soft-white/10 hover:text-soft-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet"
          aria-label={`Copy ${node.label} to clipboard`}
          title="Copy label"
        >
          <Icon name="check" size={16} />
        </button>
      </div>

      {copyState === "copied" && (
        <p role="status" className="text-xs text-emerald-300">
          Label copied to clipboard.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 text-sm">
        <Stat label="Importance" value={node.importance != null ? node.importance.toFixed(2) : "—"} />
        <Stat label="Weight" value={node.weight.toFixed(2)} />
        <Stat label="Confidence" value={node.confidence != null ? node.confidence.toFixed(2) : "—"} />
        <Stat label="Created" value={fmtDate(node.createdAt)} />
        <Stat label="Updated" value={fmtDate(node.updatedAt)} />
        <Stat label="Occurred" value={fmtDate(node.occurredAt)} />
        <Stat label="Valid from" value={fmtDate(node.validFrom)} />
        <Stat label="Valid until" value={fmtDate(node.validUntil)} />
      </div>

      <div className="space-y-3">
        <section>
          <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-slate">
            Outgoing ({outgoing.length})
          </h4>
          {outgoing.length === 0 ? (
            <p className="text-xs text-slate">None</p>
          ) : (
            <ul className="space-y-1">
              {outgoing.map((e, i) => (
                <li key={i} className="flex items-center justify-between text-xs text-slate">
                  <span>{roleLabel(e.type)} → {e.target}</span>
                  <span className="tabular-nums">{e.strength.toFixed(2)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section>
          <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-slate">
            Incoming ({incoming.length})
          </h4>
          {incoming.length === 0 ? (
            <p className="text-xs text-slate">None</p>
          ) : (
            <ul className="space-y-1">
              {incoming.map((e, i) => (
                <li key={i} className="flex items-center justify-between text-xs text-slate">
                  <span>{e.source} → {roleLabel(e.type)}</span>
                  <span className="tabular-nums">{e.strength.toFixed(2)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="mt-auto flex flex-wrap gap-2">
        {onExplore && (
          <Button type="button" size="sm" variant="secondary" onClick={() => onExplore(node)}>
            Explore connections
          </Button>
        )}
        {onHide && (
          <Button type="button" size="sm" variant="ghost" onClick={() => onHide(node)}>
            Hide node
          </Button>
        )}
      </div>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-soft-white/10 bg-midnight/40 px-3 py-2">
      <div className="text-[10px] font-medium uppercase tracking-wide text-slate">
        {label}
      </div>
      <div className="truncate text-sm text-soft-white">{value}</div>
    </div>
  );
}
