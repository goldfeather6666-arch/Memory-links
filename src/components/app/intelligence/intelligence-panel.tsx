"use client";

import { useCallback, useState } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/app/icons";
import {
  INTELLIGENCE_JOB_KINDS,
  type ConsolidationRecord,
  type ContradictionRecord,
  type IntelligenceDashboardData,
  type IntelligenceJobKind,
  type PatternRecord,
  type ProcessingSettings,
  type SuggestionRecord,
} from "@/server/intelligence/types";

interface IntelligencePanelProps {
  workspaceId: string;
  dashboard: IntelligenceDashboardData;
  settings: ProcessingSettings;
  contradictions: ContradictionRecord[];
  suggestions: SuggestionRecord[];
  patterns: PatternRecord[];
  consolidations: ConsolidationRecord[];
}

type Result = { ok: boolean; text: string };
type SuggestionAction = "accept" | "reject" | "dismiss" | "defer";
type ConflictAction = "resolved_by_user" | "dismissed" | "context_dependent";

const TOGGLEABLE_KINDS: IntelligenceJobKind[] = INTELLIGENCE_JOB_KINDS.filter(
  (k) => k !== "full_analysis",
);

const KIND_LABELS: Record<string, string> = {
  consolidation: "Consolidation",
  contradiction: "Contradiction",
  entities: "Entities",
  patterns: "Patterns",
  importance: "Importance",
  suggestions: "Suggestions",
};

async function request(
  method: "GET" | "POST" | "PATCH",
  url: string,
  body?: unknown,
): Promise<{ ok: boolean; data: unknown; error?: string }> {
  try {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json: unknown = null;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
    }
    if (!res.ok) {
      const err =
        json && typeof json === "object" && "error" in json
          ? String((json as { error?: unknown }).error)
          : `Request failed (${res.status})`;
      return { ok: false, data: null, error: err };
    }
    return { ok: true, data: json };
  } catch (err) {
    return { ok: false, data: null, error: err instanceof Error ? err.message : String(err) };
  }
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return "—";
    return value.join(", ");
  }
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function EvidenceList({ evidence }: { evidence: Record<string, unknown> }) {
  const entries = Object.entries(evidence);
  if (entries.length === 0) return <p className="text-xs text-slate">No supporting evidence.</p>;
  return (
    <ul className="mt-2 space-y-1">
      {entries.map(([key, value]) => (
        <li key={key} className="text-xs text-slate">
          <span className="text-slate/70">{key}:</span> {stringifyValue(value)}
        </li>
      ))}
    </ul>
  );
}

export function IntelligencePanel({
  workspaceId,
  dashboard: initialDashboard,
  settings: initialSettings,
  contradictions: initialContradictions,
  suggestions,
  patterns,
  consolidations,
}: IntelligencePanelProps) {
  const [dashboard, setDashboard] = useState<IntelligenceDashboardData>(initialDashboard);
  const [settings, setSettings] = useState<ProcessingSettings>(initialSettings);
  const [contradictions, setContradictions] = useState<ContradictionRecord[]>(initialContradictions);

  const [runBusy, setRunBusy] = useState(false);
  const [refreshBusy, setRefreshBusy] = useState(false);
  const [runResult, setRunResult] = useState<Result | null>(null);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [settingsResult, setSettingsResult] = useState<Result | null>(null);

  const [suggestionBusy, setSuggestionBusy] = useState<Record<string, SuggestionAction>>({});
  const [suggestionResults, setSuggestionResults] = useState<Record<string, Result>>({});
  const [conflictBusy, setConflictBusy] = useState<Record<string, ConflictAction>>({});
  const [conflictResults, setConflictResults] = useState<Record<string, Result>>({});

  const health = dashboard.health;
  const activity = dashboard.activity;

  const runAnalysis = useCallback(async () => {
    setRunBusy(true);
    setRunResult(null);
    try {
      const out = await request("POST", `/api/v1/intelligence/run?ws=${workspaceId}`);
      if (out.ok) {
        const data = out.data as { ok?: boolean; jobId?: string; jobsEnqueued?: number } | null;
        const enqueued = data?.jobsEnqueued ?? data?.jobId ? 1 : 0;
        setRunResult({ ok: true, text: `Analysis started (${enqueued} job${enqueued === 1 ? "" : "s"} enqueued).` });
        // Refresh metrics after a successful run.
        const refreshed = await request("GET", `/api/v1/intelligence/overview?ws=${workspaceId}`);
        if (refreshed.ok && refreshed.data) {
          setDashboard(refreshed.data as IntelligenceDashboardData);
        }
      } else {
        setRunResult({ ok: false, text: out.error ?? "Failed to start analysis." });
      }
    } finally {
      setRunBusy(false);
    }
  }, [workspaceId]);

  const refresh = useCallback(async () => {
    setRefreshBusy(true);
    setRunResult(null);
    try {
      const out = await request("GET", `/api/v1/intelligence/overview?ws=${workspaceId}`);
      if (out.ok && out.data) {
        setDashboard(out.data as IntelligenceDashboardData);
        setRunResult({ ok: true, text: "Metrics refreshed." });
      } else {
        setRunResult({ ok: false, text: out.error ?? "Failed to refresh metrics." });
      }
    } finally {
      setRefreshBusy(false);
    }
  }, [workspaceId]);

  const patchSettings = useCallback(
    async (patch: Partial<ProcessingSettings>) => {
      setSettingsBusy(true);
      setSettingsResult(null);
      try {
        const out = await request("PATCH", `/api/v1/intelligence/settings?ws=${workspaceId}`, patch);
        if (out.ok && out.data) {
          setSettings(out.data as ProcessingSettings);
          setSettingsResult({ ok: true, text: "Settings saved." });
        } else {
          setSettingsResult({ ok: false, text: out.error ?? "Failed to save settings." });
        }
      } finally {
        setSettingsBusy(false);
      }
    },
    [workspaceId],
  );

  const toggleAutoConsolidation = useCallback(() => {
    void patchSettings({ automaticConsolidation: !settings.automaticConsolidation });
  }, [patchSettings, settings.automaticConsolidation]);

  const toggleKind = useCallback(
    (kind: IntelligenceJobKind) => {
      const enabled = new Set(settings.enabledKinds);
      if (enabled.has(kind)) enabled.delete(kind);
      else enabled.add(kind);
      const enabledKinds = Array.from(enabled);
      void patchSettings({ enabledKinds });
    },
    [patchSettings, settings.enabledKinds],
  );

  const decideSuggestion = useCallback(
    async (id: string, action: SuggestionAction) => {
      setSuggestionBusy((prev) => ({ ...prev, [id]: action }));
      setSuggestionResults((prev) => ({ ...prev, [id]: { ok: false, text: "Saving…" } }));
      try {
        const out = await request("PATCH", `/api/v1/intelligence/suggestions/${id}`, { action });
        if (out.ok) {
          setSuggestionResults((prev) => ({
            ...prev,
            [id]: { ok: true, text: `Suggestion ${action}ed.` },
          }));
        } else {
          setSuggestionResults((prev) => ({
            ...prev,
            [id]: { ok: false, text: out.error ?? "Request failed." },
          }));
        }
      } finally {
        setSuggestionBusy((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }
    },
    [],
  );

  const resolveConflict = useCallback(
    async (id: string, status: ConflictAction) => {
      setConflictBusy((prev) => ({ ...prev, [id]: status }));
      setConflictResults((prev) => ({ ...prev, [id]: { ok: false, text: "Saving…" } }));
      try {
        const out = await request("PATCH", `/api/v1/intelligence/contradictions/${id}`, { status });
        if (out.ok) {
          setConflictResults((prev) => ({
            ...prev,
            [id]: { ok: true, text: "Conflict updated." },
          }));
          setContradictions((prev) => prev.filter((c) => c.id !== id));
        } else {
          setConflictResults((prev) => ({
            ...prev,
            [id]: { ok: false, text: out.error ?? "Request failed." },
          }));
        }
      } finally {
        setConflictBusy((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }
    },
    [],
  );

  return (
    <div className="space-y-8">
      {/* Memory Health */}
      <section>
        <CardHeader>
          <CardTitle>Memory Health</CardTitle>
        </CardHeader>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <HealthStat label="Active memories" value={health.totalActiveMemories} icon="vault" />
          <HealthStat label="Consolidated" value={health.consolidatedMemories} icon="layers" />
          <HealthStat label="Pending analysis" value={health.pendingAnalysis} icon="clock" />
          <HealthStat label="Unresolved conflicts" value={health.unresolvedConflicts} icon="shield" />
          <HealthStat label="Failed jobs" value={health.failedProcessingJobs} icon="activity" />
        </div>
      </section>

      {/* Activity summary */}
      <Card>
        <CardHeader>
          <CardTitle>Activity</CardTitle>
        </CardHeader>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <ActivityStat label="Total jobs" value={activity.totalJobs} />
          <ActivityStat label="Completed" value={activity.completedJobs} />
          <ActivityStat label="Failed" value={activity.failedJobs} />
          <div className="rounded-xl border border-soft-white/10 bg-midnight/40 px-4 py-2">
            <div className="text-sm font-medium text-soft-white">Last successful run</div>
            <div className="text-xs text-slate">{fmtDate(activity.lastSuccessfulRun)}</div>
          </div>
        </div>
        {activity.lastRunError && (
          <p className="mt-3 text-xs text-red-300">Last run error: {activity.lastRunError}</p>
        )}
      </Card>

      {/* Recent intelligence */}
      <Card>
        <CardHeader>
          <CardTitle>Recent intelligence</CardTitle>
        </CardHeader>
        {dashboard.recent.length === 0 ? (
          <EmptyState
            icon={<Icon name="spark" size={24} />}
            title="No intelligence yet"
            description="Run an analysis to start detecting patterns, consolidations, contradictions, and suggestions."
          />
        ) : (
          <div className="divide-y divide-soft-white/5">
            {dashboard.recent.map((item) => (
              <div key={item.id} className="flex flex-wrap items-center gap-3 px-1 py-3">
                <Badge variant="violet">{item.kind}</Badge>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-soft-white">{item.title}</p>
                  <p className="truncate text-xs text-slate">{item.subtitle}</p>
                </div>
                {item.status && <Badge variant="subtle">{item.status}</Badge>}
                <span className="text-xs text-slate">{fmtDate(item.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Controls */}
      <Card>
        <CardHeader>
          <CardTitle>Controls</CardTitle>
          <p className="text-sm text-slate">Choose which analysis kinds run and when.</p>
        </CardHeader>
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-soft-white">Automatic consolidation</p>
              <p className="text-xs text-slate">Consolidate related memories on a schedule.</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings.automaticConsolidation}
              onClick={toggleAutoConsolidation}
              disabled={settingsBusy}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet ${
                settings.automaticConsolidation ? "bg-violet" : "bg-soft-white/15"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  settings.automaticConsolidation ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" onClick={runAnalysis} loading={runBusy}>
              Run analysis now
            </Button>
            <Button type="button" variant="secondary" onClick={refresh} loading={refreshBusy}>
              Refresh metrics
            </Button>
          </div>
          {runResult && (
            <p role="status" className={`text-sm ${runResult.ok ? "text-emerald-300" : "text-red-300"}`}>
              {runResult.text}
            </p>
          )}

          <div>
            <p className="mb-2 text-sm font-medium text-soft-white">Enabled analysis kinds</p>
            <div className="flex flex-wrap gap-3">
              {TOGGLEABLE_KINDS.map((kind) => {
                const checked = settings.enabledKinds.includes(kind);
                return (
                  <label key={kind} className="flex cursor-pointer items-center gap-2 text-sm text-slate">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={settingsBusy}
                      onChange={() => toggleKind(kind)}
                      className="h-4 w-4 rounded border-soft-white/20 bg-midnight text-violet focus:ring-violet"
                    />
                    {KIND_LABELS[kind] ?? kind}
                  </label>
                );
              })}
            </div>
          </div>

          {settingsResult && (
            <p role="status" className={`text-sm ${settingsResult.ok ? "text-emerald-300" : "text-red-300"}`}>
              {settingsResult.text}
            </p>
          )}
        </div>
      </Card>

      {/* Suggestions */}
      <Card>
        <CardHeader>
          <CardTitle>Pending suggestions</CardTitle>
          <p className="text-sm text-slate">Review and decide on proactive suggestions.</p>
        </CardHeader>
        {suggestions.length === 0 ? (
          <EmptyState
            icon={<Icon name="spark" size={24} />}
            title="No pending suggestions"
            description="Suggestions appear here when intelligence finds something worth reviewing."
          />
        ) : (
          <div className="space-y-4">
            {suggestions.map((suggestion) => {
              const busy = suggestionBusy[suggestion.id];
              const result = suggestionResults[suggestion.id];
              return (
                <div key={suggestion.id} className="rounded-2xl border border-soft-white/10 bg-midnight/40 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="violet">{suggestion.suggestionType}</Badge>
                    <Badge variant="subtle">{suggestion.status}</Badge>
                  </div>
                  <p className="mt-2 text-sm font-medium text-soft-white">{suggestion.title}</p>
                  <p className="mt-1 text-sm text-slate">{suggestion.body}</p>
                  <EvidenceList evidence={suggestion.evidence} />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button type="button" size="sm" loading={busy === "accept"} disabled={!!busy} onClick={() => decideSuggestion(suggestion.id, "accept")}>
                      Accept
                    </Button>
                    <Button type="button" size="sm" variant="secondary" loading={busy === "reject"} disabled={!!busy} onClick={() => decideSuggestion(suggestion.id, "reject")}>
                      Reject
                    </Button>
                    <Button type="button" size="sm" variant="secondary" loading={busy === "dismiss"} disabled={!!busy} onClick={() => decideSuggestion(suggestion.id, "dismiss")}>
                      Dismiss
                    </Button>
                    <Button type="button" size="sm" variant="ghost" loading={busy === "defer"} disabled={!!busy} onClick={() => decideSuggestion(suggestion.id, "defer")}>
                      Defer
                    </Button>
                  </div>
                  {result && (
                    <p role="status" className={`mt-2 text-xs ${result.ok ? "text-emerald-300" : "text-red-300"}`}>
                      {result.text}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Unresolved conflicts */}
      <Card>
        <CardHeader>
          <CardTitle>Unresolved conflicts</CardTitle>
          <p className="text-sm text-slate">Contradictions detected across your memories.</p>
        </CardHeader>
        {contradictions.length === 0 ? (
          <EmptyState
            icon={<Icon name="shield" size={24} />}
            title="No unresolved conflicts"
            description="Conflicts appear here when the system finds statements that contradict each other."
          />
        ) : (
          <div className="space-y-4">
            {contradictions.map((conflict) => {
              const busy = conflictBusy[conflict.id];
              const result = conflictResults[conflict.id];
              return (
                <div key={conflict.id} className="rounded-2xl border border-soft-white/10 bg-midnight/40 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="danger">{conflict.category}</Badge>
                    {conflict.confidence !== null && (
                      <Badge variant="subtle">conf {conflict.confidence.toFixed(2)}</Badge>
                    )}
                  </div>
                  <EvidenceList evidence={conflict.evidence} />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button type="button" size="sm" loading={busy === "resolved_by_user"} disabled={!!busy} onClick={() => resolveConflict(conflict.id, "resolved_by_user")}>
                      Resolve
                    </Button>
                    <Button type="button" size="sm" variant="secondary" loading={busy === "context_dependent"} disabled={!!busy} onClick={() => resolveConflict(conflict.id, "context_dependent")}>
                      Context-dependent
                    </Button>
                    <Button type="button" size="sm" variant="ghost" loading={busy === "dismissed"} disabled={!!busy} onClick={() => resolveConflict(conflict.id, "dismissed")}>
                      Dismiss
                    </Button>
                  </div>
                  {result && (
                    <p role="status" className={`mt-2 text-xs ${result.ok ? "text-emerald-300" : "text-red-300"}`}>
                      {result.text}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Detected patterns */}
      <Card>
        <CardHeader>
          <CardTitle>Detected patterns</CardTitle>
        </CardHeader>
        {patterns.length === 0 ? (
          <EmptyState
            icon={<Icon name="graph" size={24} />}
            title="No patterns detected"
            description="Patterns appear here once intelligence finds repeated workflows, preferences, or projects."
          />
        ) : (
          <div className="divide-y divide-soft-white/5">
            {patterns.map((pattern) => (
              <div key={pattern.id} className="px-1 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="violet">{pattern.patternType}</Badge>
                  {pattern.confidence !== null && (
                    <Badge variant="subtle">conf {pattern.confidence.toFixed(2)}</Badge>
                  )}
                  {pattern.status !== "active" && <Badge variant="subtle">{pattern.status}</Badge>}
                </div>
                <p className="mt-1 text-sm text-slate">{pattern.description}</p>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Consolidations */}
      <Card>
        <CardHeader>
          <CardTitle>Consolidations</CardTitle>
        </CardHeader>
        {consolidations.length === 0 ? (
          <EmptyState
            icon={<Icon name="layers" size={24} />}
            title="No consolidations yet"
            description="Consolidations group related memories into clearer summaries."
          />
        ) : (
          <div className="divide-y divide-soft-white/5">
            {consolidations.map((consolidation) => (
              <div key={consolidation.id} className="px-1 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="violet">{consolidation.kind}</Badge>
                  {consolidation.confidence !== null && (
                    <Badge variant="subtle">conf {consolidation.confidence.toFixed(2)}</Badge>
                  )}
                  {consolidation.status !== "active" && (
                    <Badge variant="subtle">{consolidation.status}</Badge>
                  )}
                </div>
                <p className="mt-1 text-sm font-medium text-soft-white">{consolidation.title}</p>
                <p className="mt-1 text-sm text-slate">{consolidation.summary}</p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function HealthStat({ label, value, icon }: { label: string; value: number; icon: "vault" | "layers" | "clock" | "shield" | "activity" }) {
  return (
    <div className="rounded-xl border border-soft-white/10 bg-midnight/40 px-4 py-3">
      <div className="flex items-center gap-2 text-slate">
        <Icon name={icon} size={16} />
        <span className="text-xs uppercase tracking-wide">{label}</span>
      </div>
      <div className="mt-1 text-2xl font-semibold text-soft-white">{value}</div>
    </div>
  );
}

function ActivityStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-soft-white/10 bg-midnight/40 px-4 py-2">
      <div className="text-2xl font-semibold text-soft-white">{value}</div>
      <div className="text-xs uppercase tracking-wide text-slate">{label}</div>
    </div>
  );
}
