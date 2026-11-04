"use client";

/**
 * MNEMOSYNE Part 8 — connection detail page.
 *
 * Loads one connection (via `/api/v1/integrations/{id}`) and exposes the full
 * lifecycle: scopes, selected resources, sync interval config, sync-now,
 * pause/resume, disconnect, run history and a source explorer. Every action is
 * a real authenticated fetch; nothing is mocked.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/app/icons";
import { Button, Spinner } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/utils/cn";
import type {
  ConnectionDetailResponse,
  ConnectionMutationResponse,
  ConnectionRecord,
  ConnectionStatus,
  SourceRecord,
  SyncResponse,
  SyncRun,
} from "./types";

/* ------------------------------------------------------------------ */
/* API helpers                                                         */
/* ------------------------------------------------------------------ */

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init });
  if (!res.ok) {
    throw new Error(
      (await res.text().catch(() => res.statusText)) || `Request failed (${res.status})`,
    );
  }
  return res.json() as Promise<T>;
}

/* ------------------------------------------------------------------ */
/* Status helpers                                                      */
/* ------------------------------------------------------------------ */

const CONNECTION_STATUS_LABELS: Record<string, string> = {
  connected: "Connected",
  paused: "Paused",
  expired: "Expired",
  failed: "Failed",
  disconnected: "Disconnected",
  syncing: "Syncing",
};

const CONNECTION_STATUS_STYLES: Record<string, string> = {
  connected: "bg-emerald-500/15 text-emerald-300",
  paused: "bg-amber-500/15 text-amber-300",
  expired: "bg-red-500/15 text-red-400",
  failed: "bg-red-500/15 text-red-400",
  disconnected: "bg-soft-white/10 text-slate",
  syncing: "bg-sky-500/15 text-sky-300 animate-pulse",
};

function ConnectionStatusBadge({ status }: { status: ConnectionStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        CONNECTION_STATUS_STYLES[status] ?? "bg-soft-white/10 text-slate",
      )}
    >
      {CONNECTION_STATUS_LABELS[status] ?? status}
    </span>
  );
}

const RUN_STATUS_LABELS: Record<string, string> = {
  success: "Success",
  completed: "Completed",
  processing: "Processing",
  running: "Running",
  syncing: "Syncing",
  pending: "Pending",
  queued: "Queued",
  failed: "Failed",
  error: "Error",
  canceled: "Canceled",
  cancelled: "Cancelled",
};

function RunStatusBadge({ status }: { status: string }) {
  const lower = status.toLowerCase();
  const styles = /fail|error/.test(lower)
    ? "bg-red-500/15 text-red-400"
    : /success|complete/.test(lower)
      ? "bg-emerald-500/15 text-emerald-300"
      : /process|running|sync|pend|queu/.test(lower)
        ? "bg-sky-500/15 text-sky-300 animate-pulse"
        : "bg-soft-white/10 text-slate";
  return (
    <span
      className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", styles)}
    >
      {RUN_STATUS_LABELS[lower] ?? status}
    </span>
  );
}

function SourceStatusBadge({ status }: { status: string }) {
  const lower = status.toLowerCase();
  const isError = /fail|error/.test(lower);
  const isActive = /active|healthy|sync|ready|ok/.test(lower);
  const styles = isError
    ? "bg-red-500/15 text-red-400"
    : isActive
      ? "bg-emerald-500/15 text-emerald-300"
      : "bg-soft-white/10 text-slate";
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", styles)}>
      {status}
    </span>
  );
}

const RESOURCE_LABEL = (r: { title?: string; name?: string; label?: string }): string =>
  r.title ?? r.name ?? r.label ?? "";

function TimeText({ iso, className }: { iso: string | null; className?: string }) {
  if (!iso) return <span className={cn("text-xs text-slate", className)}>—</span>;
  return <span className={cn("text-xs text-slate", className)}>{new Date(iso).toLocaleString()}</span>;
}

/* ------------------------------------------------------------------ */
/* Runs table                                                          */
/* ------------------------------------------------------------------ */

function RunsTable({ runs }: { runs: SyncRun[] }) {
  if (runs.length === 0) {
    return <p className="text-sm text-slate">No sync runs yet.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead>
          <tr className="border-b border-soft-white/10 text-xs uppercase tracking-wide text-slate">
            <th className="px-3 py-2 font-medium">Trigger</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 text-right font-medium">Disc.</th>
            <th className="px-3 py-2 text-right font-medium">Imported</th>
            <th className="px-3 py-2 text-right font-medium">Updated</th>
            <th className="px-3 py-2 text-right font-medium">Skipped</th>
            <th className="px-3 py-2 text-right font-medium">Failed</th>
            <th className="px-3 py-2 font-medium">Error</th>
            <th className="px-3 py-2 font-medium">Started</th>
            <th className="px-3 py-2 font-medium">Finished</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-soft-white/5">
          {runs.map((run) => (
            <tr key={run.id}>
              <td className="px-3 py-2.5 text-soft-white">{run.trigger}</td>
              <td className="px-3 py-2.5"><RunStatusBadge status={run.status} /></td>
              <td className="px-3 py-2.5 text-right text-slate">{run.recordsDiscovered}</td>
              <td className="px-3 py-2.5 text-right text-slate">{run.recordsImported}</td>
              <td className="px-3 py-2.5 text-right text-slate">{run.recordsUpdated}</td>
              <td className="px-3 py-2.5 text-right text-slate">{run.recordsSkipped}</td>
              <td className="px-3 py-2.5 text-right text-red-400">{run.recordsFailed}</td>
              <td className="max-w-[180px] px-3 py-2.5">
                {run.error ? (
                  <span className="block truncate text-red-300" title={run.error}>
                    {run.error}
                  </span>
                ) : (
                  <span className="text-slate">—</span>
                )}
              </td>
              <td className="px-3 py-2.5"><TimeText iso={run.startedAt} /></td>
              <td className="px-3 py-2.5"><TimeText iso={run.finishedAt} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sources explorer                                                    */
/* ------------------------------------------------------------------ */

function SourcesExplorer({ sources }: { sources: SourceRecord[] }) {
  const [filter, setFilter] = useState<string>("all");

  const recordTypes = useMemo(() => {
    const set = new Set<string>();
    for (const s of sources) if (s.recordType) set.add(s.recordType);
    return Array.from(set).sort();
  }, [sources]);

  const visible = useMemo(() => {
    if (filter === "all") return sources;
    return sources.filter((s) => s.recordType === filter);
  }, [sources, filter]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Label htmlFor="source-type-filter" className="mb-0 text-xs text-slate">
          Record type
        </Label>
        <select
          id="source-type-filter"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="h-9 rounded-xl border border-soft-white/15 bg-midnight/60 px-3 text-sm text-soft-white focus:border-violet focus:outline-none"
        >
          <option value="all">All types</option>
          {recordTypes.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-slate">
          {sources.length === 0 ? "No sources discovered yet." : "No sources match this filter."}
        </p>
      ) : (
        <div className="divide-y divide-soft-white/5 rounded-2xl border border-soft-white/10 bg-midnight/20">
          {visible.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-medium text-soft-white">{s.title}</span>
                  <SourceStatusBadge status={s.status} />
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate">
                  <Badge variant="subtle">{s.recordType}</Badge>
                  {s.url && (
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="truncate text-violet hover:underline"
                    >
                      {s.url}
                    </a>
                  )}
                  {s.modifiedAt && <span>modified {new Date(s.modifiedAt).toLocaleString()}</span>}
                </div>
              </div>
              {s.lastIngestionId && (
                <Link
                  href={`/app/vault/${s.lastIngestionId}`}
                  className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-violet transition-colors hover:bg-violet/15"
                >
                  View in memories
                </Link>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Connection detail                                                   */
/* ------------------------------------------------------------------ */

export function ConnectionDetail({
  connectionId,
  workspaceId,
}: {
  connectionId: string;
  workspaceId: string;
}) {
  const router = useRouter();
  const qs = workspaceId ? `?ws=${encodeURIComponent(workspaceId)}` : "";

  const [detail, setDetail] = useState<ConnectionDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [syncIntervalMin, setSyncIntervalMin] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchJson<ConnectionDetailResponse>(
        `/api/v1/integrations/${encodeURIComponent(connectionId)}${qs}`,
      );
      setDetail(data);
      setSyncIntervalMin(
        data.connection.syncIntervalMin == null ? "" : String(data.connection.syncIntervalMin),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [connectionId, qs]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    void load();
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  const syncNow = useCallback(async () => {
    if (!detail) return;
    setActionError(null);
    setBusy("sync");
    try {
      await fetchJson<SyncResponse>(`/api/v1/integrations/${encodeURIComponent(connectionId)}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      await load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }, [detail, connectionId, load]);

  const togglePause = useCallback(async () => {
    if (!detail) return;
    const action = detail.connection.status === "paused" ? "resume" : "pause";
    setActionError(null);
    setBusy(action);
    try {
      const data = await fetchJson<ConnectionMutationResponse>(
        `/api/v1/integrations/${encodeURIComponent(connectionId)}/${action}`,
        { method: "POST", headers: { "Content-Type": "application/json" } },
      );
      setDetail((d) => (d ? { ...d, connection: data.connection } : d));
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }, [detail, connectionId]);

  const saveSyncInterval = useCallback(async () => {
    if (!detail) return;
    setActionError(null);
    setBusy("save");
    const parsed = syncIntervalMin.trim() === "" ? null : Number.parseInt(syncIntervalMin, 10);
    if (parsed !== null && (Number.isNaN(parsed) || parsed < 0)) {
      setActionError("Sync interval must be a non-negative number of minutes.");
      setBusy(null);
      return;
    }
    try {
      const data = await fetchJson<ConnectionMutationResponse>(
        `/api/v1/integrations/${encodeURIComponent(connectionId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ syncIntervalMin: parsed }),
        },
      );
      setDetail((d) => (d ? { ...d, connection: data.connection } : d));
      setSyncIntervalMin(data.connection.syncIntervalMin == null ? "" : String(data.connection.syncIntervalMin));
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }, [detail, connectionId, syncIntervalMin]);

  const disconnect = useCallback(async () => {
    if (!detail) return;
    if (!window.confirm(`Disconnect "${detail.connection.name}"? This removes the connection and its stored auth.`)) {
      return;
    }
    setActionError(null);
    setBusy("disconnect");
    try {
      await fetchJson<ConnectionMutationResponse>(
        `/api/v1/integrations/${encodeURIComponent(connectionId)}/disconnect`,
        { method: "POST", headers: { "Content-Type": "application/json" } },
      );
      router.push(`/app/integrations${qs}`);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  }, [detail, connectionId, router, qs]);

  if (loading) {
    return (
      <Card className="flex min-h-[320px] items-center justify-center">
        <Spinner className="h-6 w-6 text-violet" />
      </Card>
    );
  }

  if (error && !detail) {
    return (
      <Card>
        <EmptyState
          icon={<Icon name="layers" size={24} />}
          title="Could not load connection"
          description={error}
          action={
            <Button type="button" size="sm" onClick={() => void load()}>
              Retry
            </Button>
          }
        />
      </Card>
    );
  }

  const connection: ConnectionRecord | null = detail?.connection ?? null;
  if (!connection) return null;

  return (
    <div className="space-y-6">
      <Link href={`/app/integrations${qs}`} className="text-sm text-slate hover:text-soft-white">
        ← Back to Integrations
      </Link>

      {(error || actionError) && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-2.5">
          <p role="alert" className="text-sm text-red-300">
            {actionError ?? error}
          </p>
          <button
            type="button"
            onClick={() => {
              setActionError(null);
              setError(null);
            }}
            aria-label="Dismiss"
            className="text-slate hover:text-soft-white"
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      )}

      {/* Header */}
      <Card>
        <CardHeader className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet/15 text-violet">
              <Icon name="layers" size={22} />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle as="h2">{connection.name}</CardTitle>
                <ConnectionStatusBadge status={connection.status} />
                {connection.status === "paused" && <Badge variant="subtle">Paused</Badge>}
              </div>
              <p className="text-xs text-slate">
                {connection.provider} · {connection.accountName}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => void syncNow()}
              loading={busy === "sync"}
              disabled={busy !== null || connection.status === "syncing"}
            >
              Sync now
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => void togglePause()}
              loading={busy === "pause" || busy === "resume"}
              disabled={busy !== null}
            >
              {connection.status === "paused" ? "Resume" : "Pause"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="danger"
              onClick={() => void disconnect()}
              loading={busy === "disconnect"}
              disabled={busy !== null}
            >
              Disconnect
            </Button>
          </div>
        </CardHeader>
        <div className="grid gap-3 border-t border-soft-white/10 pt-4 sm:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate">Last sync</p>
            <TimeText iso={connection.lastSyncAt} className="text-soft-white" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate">Connected</p>
            <TimeText iso={connection.createdAt} className="text-soft-white" />
          </div>
        </div>
      </Card>

      {/* Scopes */}
      <Card>
        <CardHeader>
          <CardTitle>Permissions</CardTitle>
          <CardDescription>Scopes granted to this connection.</CardDescription>
        </CardHeader>
        {connection.scope.length === 0 ? (
          <p className="text-sm text-slate">No scopes recorded.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {connection.scope.map((scope) => (
              <Badge key={scope} variant="subtle">
                {scope}
              </Badge>
            ))}
          </div>
        )}
      </Card>

      {/* Selected resources */}
      <Card>
        <CardHeader>
          <CardTitle>Selected resources</CardTitle>
          <CardDescription>Sources this connection is syncing.</CardDescription>
        </CardHeader>
        {connection.selectedResources.length === 0 ? (
          <p className="text-sm text-slate">No resources selected.</p>
        ) : (
          <ul className="space-y-2">
            {connection.selectedResources.map((r, index) => (
              <li key={r.id ?? String(index)} className="rounded-xl border border-soft-white/10 px-4 py-2.5">
                <span className="text-sm text-soft-white">{RESOURCE_LABEL(r) || r.id}</span>
                {r.type && <Badge variant="subtle" className="ml-2">{r.type}</Badge>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Sync config */}
      <Card>
        <CardHeader>
          <CardTitle>Sync configuration</CardTitle>
          <CardDescription>How often this connection checks for new data.</CardDescription>
        </CardHeader>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-48">
            <Label htmlFor="sync-interval">Interval (minutes)</Label>
            <Input
              id="sync-interval"
              type="number"
              min={0}
              placeholder="Auto"
              value={syncIntervalMin}
              onChange={(e) => setSyncIntervalMin(e.target.value)}
            />
          </div>
          <Button
            type="button"
            size="sm"
            onClick={() => void saveSyncInterval()}
            loading={busy === "save"}
            disabled={busy !== null}
          >
            Save
          </Button>
        </div>
      </Card>

      {/* Runs */}
      <Card>
        <CardHeader>
          <CardTitle>Sync runs</CardTitle>
          <CardDescription>Recent run history for this connection.</CardDescription>
        </CardHeader>
        <RunsTable runs={detail?.runs ?? []} />
      </Card>

      {/* Sources */}
      <Card>
        <CardHeader>
          <CardTitle>Sources</CardTitle>
          <CardDescription>Discovered sources for this connection.</CardDescription>
        </CardHeader>
        <SourcesExplorer sources={detail?.sources ?? []} />
      </Card>
    </div>
  );
}
