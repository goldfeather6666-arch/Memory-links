"use client";

/**
 * Agent Bridge (MNEMOSYNE Part 7) — premium dashboard.
 *
 * All data comes from real authenticated fetches to the agent API
 * (`/api/v1/agent/*`). Its parent server page seeds the agent roster via the
 * real `listAgents` server query; every other read is a live fetch and every
 * write goes through the documented HTTP endpoints. No placeholder or mock data
 * is used: each section renders real records with loading / empty / error states.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Icon, type IconName } from "@/components/app/icons";
import { Button, Spinner } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/utils/cn";

/* ------------------------------------------------------------------ */
/* Types (mirror src/server/agent/types.ts + response envelopes)        */
/* ------------------------------------------------------------------ */

type AgentStatus = "active" | "suspended" | "revoked";
type AgentMode = "read_only" | "approval" | "autonomous";
type AgentCategory =
  | "coding"
  | "research"
  | "browser"
  | "personal_assistant"
  | "productivity"
  | "creative"
  | "custom";

interface Agent {
  id: string;
  workspaceId: string;
  ownerId: string;
  name: string;
  description: string | null;
  category: AgentCategory;
  integrationType: string;
  authMethod: string;
  status: AgentStatus;
  mode: AgentMode;
  lastActiveAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface CredentialMetadata {
  id: string;
  prefix: string;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
}

interface PermissionSet {
  agentId: string;
  workspaceId: string;
  scopes: string[];
  memoryTypes: string[];
  projectIds: string[];
  readOnly: boolean;
}

interface ContributionRecord {
  id: string;
  agentId: string;
  workspaceId: string;
  ownerId: string;
  kind: "memory" | "relationship" | "update" | "delete";
  payload: Record<string, unknown>;
  status: string;
  memoryId: string | null;
  sourceName: string | null;
  sourceDetail: Record<string, unknown> | null;
  duplicateOf: string | null;
  conflictNote: string | null;
  decisionActor: string | null;
  createdAt: string;
  decidedAt: string | null;
}

interface AuditEventRow {
  id: string;
  agentId: string | null;
  action: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

interface WebhookSubscription {
  id: string;
  ownerId: string;
  workspaceId: string;
  agentId: string | null;
  url: string;
  enabled: boolean;
  events: string[];
  createdAt: string;
  updatedAt: string;
}

interface UsageRow {
  operation: string;
  count: number;
  bytes: number;
  day: string;
}

interface AgentDetail {
  agent: Agent;
  permissions: PermissionSet[];
  usage: UsageRow[];
}

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

const CATEGORY_LABELS: Record<AgentCategory, string> = {
  coding: "Coding",
  research: "Research",
  browser: "Browser",
  personal_assistant: "Personal assistant",
  productivity: "Productivity",
  creative: "Creative",
  custom: "Custom",
};

const MODE_LABELS: Record<AgentMode, string> = {
  read_only: "Read-only",
  approval: "Approval",
  autonomous: "Autonomous",
};

const STATUS_LABELS: Record<AgentStatus, string> = {
  active: "Active",
  suspended: "Suspended",
  revoked: "Revoked",
};

const MODE_OPTIONS: AgentMode[] = ["read_only", "approval", "autonomous"];
const CATEGORY_OPTIONS = Object.keys(CATEGORY_LABELS) as AgentCategory[];

const READ_SCOPES = [
  "read:memory",
  "read:entity",
  "read:graph",
  "read:project",
  "read:preferences",
  "read:documents",
  "read:history",
  "read:insights",
  "read:usage",
  "read:audit",
];

const WRITE_SCOPES = [
  "propose:memory",
  "write:memory",
  "update:memory",
  "link:memory",
  "archive:memory",
  "delete:memory",
  "write:project",
];

const ADMIN_SCOPES = ["admin:manage"];

const AGENT_EVENTS = [
  "memory.created",
  "memory.updated",
  "memory.archived",
  "memory.proposed",
  "memory.approved",
  "memory.conflict_detected",
  "project.updated",
  "context.changed",
  "agent.revoked",
];

/* ------------------------------------------------------------------ */
/* API helpers                                                         */
/* ------------------------------------------------------------------ */

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = (await res.json().catch(() => ({}))) as {
    data?: T;
    error?: { message?: string; code?: string };
  };
  if (!res.ok) {
    throw new Error(data.error?.message || `Request failed (${res.status})`);
  }
  if (data.data === undefined) {
    return data as unknown as T;
  }
  return data.data;
}

const bridgeApi = {
  audit: () => api<{ items: AuditEventRow[] }>("/api/v1/agent/audit"),
  usage: () => api<{ workspaceId: string; usage: UsageRow[] }>("/api/v1/agent/usage"),
  webhooks: () => api<{ items: WebhookSubscription[] }>("/api/v1/agent/webhooks"),
  detail: (id: string) => api<AgentDetail>(`/api/v1/agent/${id}`),
  register: (body: Record<string, unknown>) =>
    api<{ agent: Agent; credential: CredentialMetadata; token: string }>(
      "/api/v1/agent/register",
      { method: "POST", body: JSON.stringify(body) },
    ),
  update: (id: string, patch: Record<string, unknown>) =>
    api<Agent>(`/api/v1/agent/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  updatePermissions: (id: string, body: Record<string, unknown>) =>
    api<{ ok: boolean }>(`/api/v1/agent/${id}/permissions`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  credentials: (id: string) =>
    api<{ items: CredentialMetadata[] }>(`/api/v1/agent/${id}/credentials`),
  issueCredential: (id: string, expiresInDays?: number) =>
    api<{ credential: CredentialMetadata; token: string }>(
      `/api/v1/agent/${id}/credentials`,
      { method: "POST", body: JSON.stringify({ expiresInDays }) },
    ),
  revokeCredential: (id: string, credId: string) =>
    api<{ ok: boolean }>(`/api/v1/agent/${id}/credentials/${credId}`, {
      method: "DELETE",
    }),
  contributions: (id: string) =>
    api<{ items: ContributionRecord[]; total: number }>(
      `/api/v1/agent/${id}/contributions`,
    ),
  decideContribution: (
    id: string,
    cid: string,
    decision: "approved" | "rejected",
    note?: string,
  ) =>
    api<ContributionRecord | null>(
      `/api/v1/agent/${id}/contributions/${cid}/decision`,
      {
        method: "POST",
        body: JSON.stringify({ decision, note }),
      },
    ),
  webhookCreate: (body: { agentId?: string; url: string; events: string[] }) =>
    api<{ subscription: WebhookSubscription; secret: string }>(
      "/api/v1/agent/webhooks",
      { method: "POST", body: JSON.stringify(body) },
    ),
  webhookDelete: (id: string) =>
    api<{ ok: boolean }>(`/api/v1/agent/webhooks/${id}`, { method: "DELETE" }),
  webhookRotate: (id: string) =>
    api<{ secret: string }>(`/api/v1/agent/webhooks/${id}/rotate`, {
      method: "POST",
    }),
};

/* ------------------------------------------------------------------ */
/* Small shared UI helpers                                             */
/* ------------------------------------------------------------------ */

function TimeText({ iso, className }: { iso: string | null; className?: string }) {
  if (!iso) return <span className={cn("text-xs text-slate", className)}>never</span>;
  return (
    <span className={cn("text-xs text-slate", className)}>
      {new Date(iso).toLocaleString()}
    </span>
  );
}

function Stat({ label, value, icon }: { label: string; value: string | number; icon?: IconName }) {
  return (
    <Card className="flex flex-col gap-2 p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-slate">{label}</span>
        {icon && <Icon name={icon} size={16} className="text-violet" />}
      </div>
      <div className="text-2xl font-semibold text-soft-white">{value}</div>
    </Card>
  );
}

function RevealSecret({
  label,
  secret,
  onDismiss,
}: {
  label: string;
  secret: string;
  onDismiss: () => void;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-xl border border-violet/30 bg-violet/10 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-soft-white">{label}</p>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(secret);
            setCopied(true);
          }}
          className="rounded-lg px-2 py-1 text-xs text-violet transition-colors hover:bg-violet/20"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <code className="mt-2 block break-all rounded-lg bg-obsidian/60 px-3 py-2 text-xs text-soft-white">
        {secret}
      </code>
      <p className="mt-2 text-xs text-slate">
        This secret is shown exactly once. Store it now — it will not be shown again.
      </p>
      <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={onDismiss}>
        Dismiss
      </Button>
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden="true" />
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl glass p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-soft-white">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-lg p-1.5 text-slate hover:bg-soft-white/10 hover:text-soft-white"
          >
            <Icon name="close" size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: AgentStatus }) {
  const map: Record<AgentStatus, "default" | "violet" | "danger"> = {
    active: "violet",
    suspended: "default",
    revoked: "danger",
  };
  return <Badge variant={map[status]}>{STATUS_LABELS[status]}</Badge>;
}

function ScopeCheck({
  scope,
  checked,
  onChange,
}: {
  scope: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate hover:bg-soft-white/5">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="h-4 w-4 accent-violet"
      />
      <span className="truncate">{scope}</span>
    </label>
  );
}

/* ------------------------------------------------------------------ */
/* Register dialog                                                      */
/* ------------------------------------------------------------------ */

interface RegisterForm {
  name: string;
  description: string;
  category: AgentCategory;
  mode: AgentMode;
  scopes: string[];
}

function RegisterDialog({
  workspaceId,
  onRegistered,
  onClose,
}: {
  workspaceId: string;
  onRegistered: (agent: Agent) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<RegisterForm>({
    name: "",
    description: "",
    category: "custom",
    mode: "approval",
    scopes: ["read:memory", "read:project"],
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [credPrefix, setCredPrefix] = useState<string>("");

  const toggleScope = useCallback((scope: string) => {
    setForm((f) => ({
      ...f,
      scopes: f.scopes.includes(scope)
        ? f.scopes.filter((s) => s !== scope)
        : [...f.scopes, scope],
    }));
  }, []);

  const submit = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await bridgeApi.register({
        name: form.name,
        description: form.description || undefined,
        category: form.category,
        mode: form.mode,
        workspaceId,
        scopes: form.scopes,
      });
      setSecret(result.token);
      setCredPrefix(result.credential.prefix);
      onRegistered(result.agent);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [form, workspaceId, onRegistered]);

  return (
    <Modal title="Register agent" onClose={onClose}>
      {secret ? (
        <div className="space-y-4">
          <RevealSecret
            label={`Credential issued for "${form.name}"`}
            secret={secret}
            onDismiss={onClose}
          />
          <p className="text-sm text-slate">
            Credential prefix <code className="text-soft-white">{credPrefix}</code> — the token
            above is the only time it will be revealed.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <Label htmlFor="reg-name">Name</Label>
            <Input
              id="reg-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. my-code-workflow"
            />
          </div>
          <div>
            <Label htmlFor="reg-desc">Description</Label>
            <Input
              id="reg-desc"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="What will this agent do?"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="reg-category">Category</Label>
              <select
                id="reg-category"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value as AgentCategory })}
                className="h-11 w-full rounded-xl border border-soft-white/15 bg-midnight/60 px-3 text-sm text-soft-white focus:border-violet focus:outline-none"
              >
                {CATEGORY_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="reg-mode">Mode</Label>
              <select
                id="reg-mode"
                value={form.mode}
                onChange={(e) => setForm({ ...form, mode: e.target.value as AgentMode })}
                className="h-11 w-full rounded-xl border border-soft-white/15 bg-midnight/60 px-3 text-sm text-soft-white focus:border-violet focus:outline-none"
              >
                {MODE_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {MODE_LABELS[m]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <span className="mb-1.5 block text-sm font-medium text-slate">Initial permissions</span>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {READ_SCOPES.map((s) => (
                <ScopeCheck key={s} scope={s} checked={form.scopes.includes(s)} onChange={() => toggleScope(s)} />
              ))}
              {WRITE_SCOPES.map((s) => (
                <ScopeCheck key={s} scope={s} checked={form.scopes.includes(s)} onChange={() => toggleScope(s)} />
              ))}
            </div>
          </div>
          {error && <p className="text-sm text-red-300">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" onClick={submit} loading={busy} disabled={!form.name.trim()}>
              Register
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Agent list                                                          */
/* ------------------------------------------------------------------ */

function AgentList({
  agents,
  selectedId,
  onSelect,
  onRegister,
}: {
  agents: Agent[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRegister: () => void;
}) {
  return (
    <Card className="flex flex-col p-0">
      <CardHeader className="flex items-center justify-between px-5 pt-5">
        <div>
          <CardTitle>Agents</CardTitle>
          <CardDescription>{agents.length} registered</CardDescription>
        </div>
        <Button type="button" size="sm" onClick={onRegister}>
          <Icon name="plus" size={16} /> Register
        </Button>
      </CardHeader>
      {agents.length === 0 ? (
        <div className="px-5 pb-5">
          <EmptyState
            icon={<Icon name="bridge" size={24} />}
            title="No agents yet"
            description="Register an agent to generate a credential and connect your tooling."
          />
        </div>
      ) : (
        <div className="divide-y divide-soft-white/5">
          {agents.map((agent) => (
            <button
              key={agent.id}
              type="button"
              onClick={() => onSelect(agent.id)}
              aria-pressed={selectedId === agent.id}
              className={cn(
                "flex w-full items-center gap-3 px-5 py-3 text-left transition-colors",
                selectedId === agent.id
                  ? "bg-violet/10"
                  : "hover:bg-soft-white/5",
              )}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet/15 text-violet">
                <Icon name="bridge" size={18} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-soft-white">
                  {agent.name}
                </span>
                <span className="block truncate text-xs text-slate">
                  {CATEGORY_LABELS[agent.category]} · {MODE_LABELS[agent.mode]}
                </span>
              </span>
              <StatusBadge status={agent.status} />
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Agent detail                                                        */
/* ------------------------------------------------------------------ */

function AgentDetailPanel({
  agent,
  onChanged,
  onError,
}: {
  agent: Agent;
  onChanged: (next: Agent) => void;
  onError: (msg: string) => void;
}) {
  const [detail, setDetail] = useState<AgentDetail | null>(null);
  const [credentials, setCredentials] = useState<CredentialMetadata[]>([]);
  const [contributions, setContributions] = useState<ContributionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(agent.name);
  const [description, setDescription] = useState(agent.description ?? "");
  const [mode, setMode] = useState<AgentMode>(agent.mode);
  const [category, setCategory] = useState<AgentCategory>(agent.category);
  const [saving, setSaving] = useState(false);

  const [issued, setIssued] = useState<{ prefix: string; token: string } | null>(null);
  const [issueBusy, setIssueBusy] = useState(false);
  const [expiry, setExpiry] = useState<number | "">("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [d, creds, conts] = await Promise.all([
        bridgeApi.detail(agent.id),
        bridgeApi.credentials(agent.id),
        bridgeApi.contributions(agent.id),
      ]);
      setDetail(d);
      setCredentials(creds.items ?? []);
      setContributions(conts.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [agent.id]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setEditing(false);
    setName(agent.name);
    setDescription(agent.description ?? "");
    setMode(agent.mode);
    setCategory(agent.category);
    setIssued(null);
    /* eslint-enable react-hooks/set-state-in-effect */
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent.id]);

  const saveEdit = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const next = await bridgeApi.update(agent.id, { name, description: description || null, mode, category });
      setEditing(false);
      onChanged(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [agent.id, name, description, mode, category, onChanged]);

  const setStatus = useCallback(
    async (status: AgentStatus) => {
      if (status === "revoked") {
        if (!window.confirm(`Revoke "${agent.name}"? All credentials will be invalidated.`)) return;
      }
      setError(null);
      try {
        const next = await bridgeApi.update(agent.id, { status });
        onChanged(next);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        onError(msg);
      }
    },
    [agent.id, agent.name, onChanged, onError],
  );

  const issueCredential = useCallback(async () => {
    setIssueBusy(true);
    setError(null);
    try {
      const days = expiry === "" || expiry <= 0 ? undefined : expiry;
      const r = await bridgeApi.issueCredential(agent.id, days);
      setIssued({ prefix: r.credential.prefix, token: r.token });
      setCredentials((prev) => [r.credential, ...prev]);
      setExpiry("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIssueBusy(false);
    }
  }, [agent.id, expiry]);

  const revokeCredential = useCallback(
    async (credId: string) => {
      setError(null);
      try {
        await bridgeApi.revokeCredential(agent.id, credId);
        setCredentials((prev) =>
          prev.map((c) => (c.id === credId ? { ...c, revokedAt: new Date().toISOString() } : c)),
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [agent.id],
  );

  const decide = useCallback(
    async (cid: string, decision: "approved" | "rejected") => {
      setError(null);
      try {
        await bridgeApi.decideContribution(agent.id, cid, decision);
        setContributions((prev) =>
          prev.map((c) =>
            c.id === cid
              ? { ...c, status: decision, decidedAt: new Date().toISOString() }
              : c,
          ),
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [agent.id],
  );

  const savePermissions = useCallback(
    async (scopes: string[], readOnly: boolean) => {
      setError(null);
      try {
        await bridgeApi.updatePermissions(agent.id, { scopes, readOnly });
        setDetail((d) => (d ? { ...d, permissions: d.permissions.map((p) => ({ ...p, scopes, readOnly })) } : d));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [agent.id],
  );

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
          icon={<Icon name="bridge" size={24} />}
          title="Could not load agent"
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

  const perms: PermissionSet | null = detail?.permissions?.[0] ?? null;

  return (
    <div className="space-y-5">
      {error && <p className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}

      {/* Identity */}
      <Card>
        <CardHeader className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet/15 text-violet">
              <Icon name="bridge" size={22} />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle as="h2">{agent.name}</CardTitle>
                <StatusBadge status={agent.status} />
                <Badge variant="subtle">{MODE_LABELS[agent.mode]}</Badge>
              </div>
              <p className="text-xs text-slate">
                {CATEGORY_LABELS[agent.category]} · {agent.integrationType} · {agent.authMethod}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={() => setEditing((v) => !v)}>
              Edit
            </Button>
            {agent.status === "revoked" ? (
              <Button type="button" size="sm" variant="secondary" disabled>
                Revoked
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => setStatus(agent.status === "active" ? "suspended" : "active")}
                >
                  {agent.status === "active" ? "Suspend" : "Activate"}
                </Button>
                <Button type="button" size="sm" variant="danger" onClick={() => setStatus("revoked")}>
                  Revoke
                </Button>
              </>
            )}
          </div>
        </CardHeader>

        {editing ? (
          <div className="space-y-4 border-t border-soft-white/10 pt-4">
            <div>
              <Label htmlFor="edit-name">Name</Label>
              <Input id="edit-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="edit-desc">Description</Label>
              <Input id="edit-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="edit-category">Category</Label>
                <select
                  id="edit-category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value as AgentCategory)}
                  className="h-11 w-full rounded-xl border border-soft-white/15 bg-midnight/60 px-3 text-sm text-soft-white focus:border-violet focus:outline-none"
                >
                  {CATEGORY_OPTIONS.map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="edit-mode">Mode</Label>
                <select
                  id="edit-mode"
                  value={mode}
                  onChange={(e) => setMode(e.target.value as AgentMode)}
                  className="h-11 w-full rounded-xl border border-soft-white/15 bg-midnight/60 px-3 text-sm text-soft-white focus:border-violet focus:outline-none"
                >
                  {MODE_OPTIONS.map((m) => (
                    <option key={m} value={m}>
                      {MODE_LABELS[m]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button type="button" size="sm" onClick={saveEdit} loading={saving}>
                Save
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid gap-3 border-t border-soft-white/10 pt-4 sm:grid-cols-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate">Created</p>
              <TimeText iso={agent.createdAt} />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate">Last active</p>
              <TimeText iso={agent.lastActiveAt} />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate">Owner</p>
              <p className="text-xs text-soft-white">{agent.ownerId.slice(0, 8)}…</p>
            </div>
            {agent.description && (
              <p className="text-sm text-slate sm:col-span-3">{agent.description}</p>
            )}
          </div>
        )}
      </Card>

      {/* Permissions */}
      <Card>
        <CardHeader>
          <CardTitle>Permissions</CardTitle>
          <CardDescription>
            Scopes control what this agent may read and write. Changes apply immediately.
          </CardDescription>
        </CardHeader>
        {perms ? (
          <PermissionsEditor key={agent.id} perms={perms} onSave={savePermissions} />
        ) : (
          <p className="text-sm text-slate">No permission set found for this workspace.</p>
        )}
      </Card>

      {/* Credentials */}
      <Card>
        <CardHeader className="flex items-center justify-between">
          <div>
            <CardTitle>Credentials</CardTitle>
            <CardDescription>Tokens used to authenticate the agent API.</CardDescription>
          </div>
        </CardHeader>
        {issued && (
          <div className="mb-4">
            <RevealSecret
              label={`New credential issued (prefix ${issued.prefix})`}
              secret={issued.token}
              onDismiss={() => setIssued(null)}
            />
          </div>
        )}
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div className="w-40">
            <Label htmlFor="cred-expiry">Expires in (days)</Label>
            <Input
              id="cred-expiry"
              type="number"
              min={1}
              value={expiry}
              onChange={(e) => setExpiry(e.target.value === "" ? "" : Number(e.target.value))}
              placeholder="never"
            />
          </div>
          <Button type="button" size="sm" onClick={issueCredential} loading={issueBusy}>
            <Icon name="plus" size={16} /> Issue credential
          </Button>
        </div>
        {credentials.length === 0 ? (
          <p className="text-sm text-slate">No credentials issued yet.</p>
        ) : (
          <div className="divide-y divide-soft-white/5 rounded-xl border border-soft-white/10">
            {credentials.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <code className="text-xs text-soft-white">{c.prefix}…</code>
                <Badge variant={c.revokedAt ? "danger" : "violet"}>
                  {c.revokedAt ? "Revoked" : "Active"}
                </Badge>
                <span className="text-xs text-slate">created {new Date(c.createdAt).toLocaleDateString()}</span>
                {c.expiresAt && (
                  <span className="text-xs text-slate">
                    expires {new Date(c.expiresAt).toLocaleDateString()}
                  </span>
                )}
                {!c.revokedAt && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="ml-auto text-red-300 hover:text-red-200"
                    onClick={() => revokeCredential(c.id)}
                  >
                    Revoke
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Contributions */}
      <Card>
        <CardHeader>
          <CardTitle>Contributions</CardTitle>
          <CardDescription>Memory proposals this agent has submitted, pending review.</CardDescription>
        </CardHeader>
        {contributions.length === 0 ? (
          <p className="text-sm text-slate">No contributions yet.</p>
        ) : (
          <div className="space-y-2">
            {contributions.slice(0, 15).map((c) => (
              <div key={c.id} className="rounded-xl border border-soft-white/10 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="subtle">{c.kind}</Badge>
                  <Badge variant={c.status === "pending" ? "violet" : "default"}>{c.status}</Badge>
                  <span className="text-xs text-slate">{new Date(c.createdAt).toLocaleString()}</span>
                </div>
                <p className="mt-2 text-sm text-soft-white line-clamp-2">
                  {typeof c.payload.content === "string" ? c.payload.content : JSON.stringify(c.payload)}
                </p>
                {c.status === "pending" && (
                  <div className="mt-2 flex gap-2">
                    <Button type="button" size="sm" onClick={() => decide(c.id, "approved")}>
                      <Icon name="check" size={14} /> Approve
                    </Button>
                    <Button type="button" size="sm" variant="danger" onClick={() => decide(c.id, "rejected")}>
                      Reject
                    </Button>
                  </div>
                )}
                {c.conflictNote && <p className="mt-1 text-xs text-red-300">{c.conflictNote}</p>}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function PermissionsEditor({
  perms,
  onSave,
}: {
  perms: PermissionSet;
  onSave: (scopes: string[], readOnly: boolean) => Promise<void>;
}) {
  const [scopes, setScopes] = useState<string[]>(perms.scopes);
  const [readOnly, setReadOnly] = useState(perms.readOnly);
  const [saving, setSaving] = useState(false);

  const toggle = useCallback((scope: string) => {
    setScopes((prev) => (prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]));
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      await onSave(scopes, readOnly);
    } finally {
      setSaving(false);
    }
  }, [onSave, scopes, readOnly]);

  const renderScopeGroup = (title: string, list: string[]) => (
    <div>
      <p className="mb-1 text-xs uppercase tracking-wide text-slate">{title}</p>
      <div className="grid gap-1 sm:grid-cols-2">
        {list.map((s) => (
          <ScopeCheck key={s} scope={s} checked={scopes.includes(s)} onChange={() => toggle(s)} />
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {renderScopeGroup("Read", READ_SCOPES)}
      {renderScopeGroup("Write / propose", WRITE_SCOPES)}
      {renderScopeGroup("Admin", ADMIN_SCOPES)}
      <label className="flex cursor-pointer items-center gap-2 text-sm text-slate">
        <input
          type="checkbox"
          checked={readOnly}
          onChange={(e) => setReadOnly(e.target.checked)}
          className="h-4 w-4 accent-violet"
        />
        Read-only (block all writes / proposals)
      </label>
      <div className="flex justify-end">
        <Button type="button" size="sm" onClick={save} loading={saving}>
          Save permissions
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Audit panel                                                          */
/* ------------------------------------------------------------------ */

function actionLabel(action: string): string {
  const map: Record<string, string> = {
    "agent.registered": "Agent registered",
    "agent.updated": "Agent updated",
    "agent.permissions.updated": "Permissions updated",
    "agent.credential.issued": "Credential issued",
    "agent.credential.revoked": "Credential revoked",
    "agent.contribution.approved": "Contribution approved",
    "agent.contribution.rejected": "Contribution rejected",
    "agent.contribute.memory": "Memory proposed",
    "agent.contribute.update": "Update proposed",
    "agent.contribute.delete": "Delete proposed",
    "agent.deleted": "Agent deleted",
    "webhook.subscribed": "Webhook subscribed",
  };
  return map[action] ?? action.replace(/\./g, " ");
}

function AuditPanel({ events, agents }: { events: AuditEventRow[]; agents: Agent[] }) {
  const agentsByName = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of agents) m.set(a.id, a.name);
    return m;
  }, [agents]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Icon name="shield" size={18} className="text-violet" />
          <CardTitle>Security & audit log</CardTitle>
        </div>
        <CardDescription>Recent agent security and activity events.</CardDescription>
      </CardHeader>
      {events.length === 0 ? (
        <p className="text-sm text-slate">No audit events yet.</p>
      ) : (
        <div className="space-y-2">
          {events.slice(0, 20).map((e) => (
            <div key={e.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-soft-white/10 px-4 py-2.5">
              <Badge variant="subtle">{actionLabel(e.action)}</Badge>
              {e.agentId && (
                <span className="text-xs text-slate">
                  agent {agentsByName.get(e.agentId) ?? e.agentId.slice(0, 8)}
                </span>
              )}
              <span className="text-xs text-slate">{new Date(e.createdAt).toLocaleString()}</span>
              {Object.keys(e.metadata).length > 0 && (
                <code className="ml-auto hidden max-w-[40%] truncate text-xs text-slate sm:block">
                  {JSON.stringify(e.metadata)}
                </code>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Webhooks panel                                                       */
/* ------------------------------------------------------------------ */

function WebhooksPanel({ agents }: { agents: Agent[] }) {
  const [subs, setSubs] = useState<WebhookSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [url, setUrl] = useState("");
  const [agentId, setAgentId] = useState<string>("");
  const [events, setEvents] = useState<string[]>(["memory.created"]);
  const [busy, setBusy] = useState(false);
  const [createdSecret, setCreatedSecret] = useState<{ label: string; token: string } | null>(null);
  const [rotateSecret, setRotateSecret] = useState<{ id: string; token: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await bridgeApi.webhooks();
      setSubs(r.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    void load();
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleEvent = useCallback((ev: string) => {
    setEvents((prev) => (prev.includes(ev) ? prev.filter((e) => e !== ev) : [...prev, ev]));
  }, []);

  const create = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await bridgeApi.webhookCreate({
        url,
        agentId: agentId || undefined,
        events,
      });
      setSubs((prev) => [r.subscription, ...prev]);
      setCreatedSecret({ label: `Webhook created at ${r.subscription.url}`, token: r.secret });
      setUrl("");
      setAgentId("");
      setEvents(["memory.created"]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [url, agentId, events]);

  const remove = useCallback(
    async (id: string) => {
      setError(null);
      try {
        await bridgeApi.webhookDelete(id);
        setSubs((prev) => prev.filter((s) => s.id !== id));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [],
  );

  const rotate = useCallback(
    async (id: string) => {
      setError(null);
      try {
        const r = await bridgeApi.webhookRotate(id);
        setRotateSecret({ id, token: r.secret });
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [],
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Icon name="layers" size={18} className="text-violet" />
          <CardTitle>Webhook subscriptions</CardTitle>
        </div>
        <CardDescription>Deliver agent events to your endpoints with HMAC signatures.</CardDescription>
      </CardHeader>

      {createdSecret && (
        <div className="mb-4">
          <RevealSecret label={createdSecret.label} secret={createdSecret.token} onDismiss={() => setCreatedSecret(null)} />
        </div>
      )}

      <div className="mb-4 space-y-3 rounded-xl border border-soft-white/10 p-4">
        <div>
          <Label htmlFor="wh-url">Endpoint URL</Label>
          <Input id="wh-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/hooks/mnemosyne" />
        </div>
        <div>
          <Label htmlFor="wh-agent">Agent</Label>
          <select
            id="wh-agent"
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
            className="h-11 w-full rounded-xl border border-soft-white/15 bg-midnight/60 px-3 text-sm text-soft-white focus:border-violet focus:outline-none"
          >
            <option value="">All agents</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <span className="mb-1.5 block text-sm font-medium text-slate">Events</span>
          <div className="flex flex-wrap gap-2">
            {AGENT_EVENTS.map((ev) => (
              <label
                key={ev}
                className={cn(
                  "flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors",
                  events.includes(ev)
                    ? "border-violet/40 bg-violet/15 text-soft-white"
                    : "border-soft-white/10 text-slate hover:bg-soft-white/5",
                )}
              >
                <input
                  type="checkbox"
                  checked={events.includes(ev)}
                  onChange={() => toggleEvent(ev)}
                  className="h-3.5 w-3.5 accent-violet"
                />
                {ev}
              </label>
            ))}
          </div>
        </div>
        <div className="flex justify-end">
          <Button type="button" size="sm" onClick={create} loading={busy} disabled={!url.trim() || events.length === 0}>
            Create subscription
          </Button>
        </div>
      </div>

      {error && <p className="mb-3 text-sm text-red-300">{error}</p>}

      {loading ? (
        <div className="flex justify-center py-6">
          <Spinner className="h-5 w-5 text-violet" />
        </div>
      ) : subs.length === 0 ? (
        <p className="text-sm text-slate">No webhook subscriptions yet.</p>
      ) : (
        <div className="space-y-2">
          {subs.map((s) => (
            <div key={s.id} className="rounded-xl border border-soft-white/10 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <code className="text-xs text-soft-white">{s.url}</code>
                <Badge variant={s.enabled ? "violet" : "default"}>{s.enabled ? "Enabled" : "Disabled"}</Badge>
                <span className="text-xs text-slate">{new Date(s.createdAt).toLocaleDateString()}</span>
                <Button type="button" size="sm" variant="ghost" className="ml-auto" onClick={() => rotate(s.id)}>
                  Rotate secret
                </Button>
                <Button type="button" size="sm" variant="ghost" className="text-red-300" onClick={() => remove(s.id)}>
                  Delete
                </Button>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {s.events.map((ev) => (
                  <Badge key={ev} variant="subtle">
                    {ev}
                  </Badge>
                ))}
              </div>
              {rotateSecret && rotateSecret.id === s.id && (
                <div className="mt-3">
                  <RevealSecret label="Rotated signature secret" secret={rotateSecret.token} onDismiss={() => setRotateSecret(null)} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Dashboard (default export)                                           */
/* ------------------------------------------------------------------ */

export function BridgeDashboard({
  initialAgents,
  workspaceId,
}: {
  initialAgents: Agent[];
  workspaceId: string;
}) {
  const [agents, setAgents] = useState<Agent[]>(initialAgents);
  const [selectedId, setSelectedId] = useState<string | null>(initialAgents[0]?.id ?? null);

  const [usage, setUsage] = useState<UsageRow[]>([]);
  const [audit, setAudit] = useState<AuditEventRow[]>([]);
  const [webhooks, setWebhooks] = useState<WebhookSubscription[]>([]);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [overviewError, setOverviewError] = useState<string | null>(null);

  const [showRegister, setShowRegister] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    setOverviewLoading(true);
    setOverviewError(null);
    try {
      const [u, a, w] = await Promise.all([
        bridgeApi.usage(),
        bridgeApi.audit(),
        bridgeApi.webhooks(),
      ]);
      setUsage(u.usage ?? []);
      setAudit(a.items ?? []);
      setWebhooks(w.items ?? []);
    } catch (e) {
      setOverviewError(e instanceof Error ? e.message : String(e));
    } finally {
      setOverviewLoading(false);
    }
  }, []);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    void loadOverview();
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRegistered = useCallback((agent: Agent) => {
    setAgents((prev) => [agent, ...prev.filter((a) => a.id !== agent.id)]);
    setSelectedId(agent.id);
    setBanner(`Agent "${agent.name}" registered. Store the credential — it is shown once.`);
  }, []);

  const handleChanged = useCallback((next: Agent) => {
    setAgents((prev) => prev.map((a) => (a.id === next.id ? next : a)));
  }, []);

  const handleError = useCallback((msg: string) => {
    setBanner(msg);
  }, []);

  const totalRequests = useMemo(() => usage.reduce((n, r) => n + r.count, 0), [usage]);
  const topOperation = useMemo(() => {
    if (!usage.length) return null;
    const byOp = new Map<string, number>();
    for (const r of usage) byOp.set(r.operation, (byOp.get(r.operation) ?? 0) + r.count);
    let best: { op: string; n: number } | null = null;
    for (const [op, n] of byOp) {
      if (!best || n > best.n) best = { op, n };
    }
    return best;
  }, [usage]);

  const counts = useMemo(() => {
    const active = agents.filter((a) => a.status === "active").length;
    const revoked = agents.filter((a) => a.status === "revoked").length;
    return { registered: agents.length, active, suspended: agents.length - active - revoked, revoked };
  }, [agents]);

  const selectedAgent = useMemo(() => agents.find((a) => a.id === selectedId) ?? null, [agents, selectedId]);

  return (
    <div className="space-y-6">
      {banner && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-violet/30 bg-violet/10 px-4 py-2.5">
          <p className="text-sm text-soft-white">{banner}</p>
          <button type="button" onClick={() => setBanner(null)} aria-label="Dismiss" className="text-slate hover:text-soft-white">
            <Icon name="close" size={16} />
          </button>
        </div>
      )}

      {/* Overview */}
      {overviewLoading ? (
        <div className="flex justify-center py-8">
          <Spinner className="h-6 w-6 text-violet" />
        </div>
      ) : overviewError ? (
        <Card>
          <EmptyState
            icon={<Icon name="activity" size={24} />}
            title="Could not load overview"
            description={overviewError}
            action={
              <Button type="button" size="sm" onClick={() => void loadOverview()}>
                Retry
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat label="Registered" value={counts.registered} />
          <Stat label="Active" value={counts.active} icon="activity" />
          <Stat label="Revoked" value={counts.revoked} icon="shield" />
          <Stat label="Requests (30d)" value={totalRequests} icon="clock" />
        </div>
      )}

      {/* Top ops + webhook summary */}
      {topOperation && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate">
          <span>Top operation:</span>
          <Badge variant="subtle">{topOperation.op}</Badge>
          <span>
            ({topOperation.n} calls)
          </span>
          <span>· {webhooks.length} webhook subscription{webhooks.length === 1 ? "" : "s"} · {audit.length} audit events</span>
        </div>
      )}

      {/* Main: list + detail */}
      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <AgentList agents={agents} selectedId={selectedId} onSelect={setSelectedId} onRegister={() => setShowRegister(true)} />
        {selectedAgent ? (
          <AgentDetailPanel agent={selectedAgent} onChanged={handleChanged} onError={handleError} />
        ) : (
          <Card className="flex min-h-[320px] items-center justify-center">
            <EmptyState
              icon={<Icon name="bridge" size={24} />}
              title="Select an agent"
              description="Choose an agent to inspect its identity, permissions, credentials, usage and pending contributions."
            />
          </Card>
        )}
      </div>

      <AuditPanel events={audit} agents={agents} />
      <WebhooksPanel agents={agents} />

      {showRegister && (
        <RegisterDialog workspaceId={workspaceId} onRegistered={handleRegistered} onClose={() => setShowRegister(false)} />
      )}
    </div>
  );
}
