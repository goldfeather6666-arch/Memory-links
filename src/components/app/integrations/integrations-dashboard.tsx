"use client";

/**
 * MNEMOSYNE Part 8 — Integrations Center overview.
 *
 * Renders the connector catalog (from `/api/v1/integrations/config`) and the
 * user's real connection list (from `/api/v1/integrations`). Connect buttons
 * start the OAuth flow via POST connect → redirect. All reads/writes are
 * authenticated by the browser session cookie; no mock/placeholder data.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/app/icons";
import { Button, Spinner } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/utils/cn";
import type {
  Connector,
  ConnectorCapabilities,
  ConnectionRecord,
  ConnectionStatus,
  ConnectionsResponse,
  ConnectResponse,
  IntegrationsConfigResponse,
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
/* Status badge                                                        */
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

/* ------------------------------------------------------------------ */
/* Capabilities                                                        */
/* ------------------------------------------------------------------ */

const CAPABILITY_LABELS: Record<keyof ConnectorCapabilities, string> = {
  oauth: "OAuth",
  webhooks: "Webhooks",
  incremental: "Incremental",
  historicalImport: "Historical import",
  selectiveSync: "Selective sync",
  deletionDetection: "Deletion detection",
};

/* ------------------------------------------------------------------ */
/* Integrations dashboard                                              */
/* ------------------------------------------------------------------ */

export function IntegrationsDashboard({ workspaceId }: { workspaceId: string }) {
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [connections, setConnections] = useState<ConnectionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectingProvider, setConnectingProvider] = useState<string | null>(null);

  const qs = workspaceId ? `?ws=${encodeURIComponent(workspaceId)}` : "";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [config, conns] = await Promise.all([
        fetchJson<IntegrationsConfigResponse>("/api/v1/integrations/config"),
        fetchJson<ConnectionsResponse>(`/api/v1/integrations${qs}`),
      ]);
      setConnectors(config.connectors ?? []);
      setConnections(conns.connections ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [qs]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    void load();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [load]);

  const connect = useCallback(
    async (provider: string) => {
      setConnectingProvider(provider);
      setError(null);
      try {
        const res = await fetch(`/api/v1/integrations/${encodeURIComponent(provider)}/connect`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            redirectTo: `${window.location.origin}/app/integrations${qs}`,
          }),
        });
        if (!res.ok) {
          if (res.status === 409) {
            setError("Not configured for this environment.");
            return;
          }
          const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
          setError(data?.error?.message || `Request failed (${res.status})`);
          return;
        }
        const data = (await res.json()) as ConnectResponse;
        if (data.url) {
          window.location.href = data.url;
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setConnectingProvider(null);
      }
    },
    [qs],
  );

  const connectionsByProvider = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of connections) map.set(c.provider, (map.get(c.provider) ?? 0) + 1);
    return map;
  }, [connections]);

  const totalConnected = connections.length;

  if (loading) {
    return (
      <div className="space-y-6" aria-busy="true">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-44 animate-pulse rounded-2xl border border-soft-white/10 bg-midnight/40"
            />
          ))}
        </div>
        <div className="flex justify-center py-6">
          <Spinner className="h-6 w-6 text-violet" />
        </div>
      </div>
    );
  }

  if (error && connectors.length === 0 && connections.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<Icon name="layers" size={24} />}
          title="Could not load integrations"
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

  return (
    <div className="space-y-8">
      {error && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-2.5">
          <p role="alert" className="text-sm text-red-300">
            {error}
          </p>
          <button
            type="button"
            onClick={() => setError(null)}
            aria-label="Dismiss"
            className="text-slate hover:text-soft-white"
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      )}

      {/* Connector catalog */}
      <section aria-label="Available connectors">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-soft-white">Connectors</h2>
            <p className="text-sm text-slate">Bring data in from external sources.</p>
          </div>
          <Badge variant="subtle">{totalConnected} connected</Badge>
        </div>

        {connectors.length === 0 ? (
          <EmptyState
            icon={<Icon name="layers" size={24} />}
            title="No connectors available"
            description="Connector configuration has not been set up for this environment yet."
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {connectors.map((connector) => (
              <Card key={connector.provider} className="flex flex-col gap-3 p-5">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet/15 text-violet">
                    <Icon name="layers" size={20} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-base font-semibold text-soft-white">
                        {connector.name}
                      </h3>
                      <Badge variant="subtle">{connector.category}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-slate">{connector.description}</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {(Object.keys(CAPABILITY_LABELS) as (keyof ConnectorCapabilities)[])
                    .filter((key) => connector.capabilities[key])
                    .map((key) => (
                      <Badge key={key} variant="violet">
                        {CAPABILITY_LABELS[key]}
                      </Badge>
                    ))}
                </div>

                <div className="mt-auto flex items-center justify-between gap-3 border-t border-soft-white/10 pt-3">
                  <span className="text-xs text-slate">
                    {connectionsByProvider.get(connector.provider) ?? 0} connected
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    disabled={!connector.available || connector.connected > 0}
                    loading={connectingProvider === connector.provider}
                    onClick={() => connect(connector.provider)}
                  >
                    {connector.connected ? "Connected" : "Connect"}
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Existing connections */}
      <section aria-label="Your connections">
        <h2 className="mb-4 text-lg font-semibold text-soft-white">Your connections</h2>
        {connections.length === 0 ? (
          <EmptyState
            icon={<Icon name="layers" size={24} />}
            title="No connections yet"
            description="Connect your first source to start importing data into your memory."
          />
        ) : (
          <div className="divide-y divide-soft-white/5 rounded-2xl border border-soft-white/10 bg-midnight/20">
            {connections.map((c) => (
              <Link
                key={c.id}
                href={`/app/integrations/${c.id}${qs}`}
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-soft-white/5"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet/15 text-violet">
                  <Icon name="layers" size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-soft-white">
                    {c.name}
                  </span>
                  <span className="block truncate text-xs text-slate">{c.accountName}</span>
                </span>
                <ConnectionStatusBadge status={c.status} />
                <Icon name="arrow-right" size={16} className="text-slate" />
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
