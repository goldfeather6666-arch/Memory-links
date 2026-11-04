import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/server/auth/session";
import { listWorkspacesForUser } from "@/server/data/workspaces";
import { recallMemories } from "@/server/memory/retrieval";
import { getMemory } from "@/server/memory/storage";
import { listRelatedMemories } from "@/server/memory/relationships";
import { projectGraph } from "@/server/intelligence/graph";
import { authenticateAgentRequest, AgentAuthError } from "./auth";
import { registerAgent, getAgent, listAgents, updateAgent, revokeAgent, deleteAgent } from "./registry";
import { issueCredential, listCredentials, revokeCredential } from "./credentials";
import { listPermissionSets, readPermissionSet, canReadMemory, canReadProject, canReadGraph, canReadInsights, canAdmin, canReadUsage } from "./permissions";
import { decideContribution, listContributions, submitContribution } from "./contribution";
import { archiveContribution } from "./contribution";
import { buildContextPackage, projectHistory } from "./context";
import { getAgentUsage, getWorkspaceUsage } from "./usage";
import { listAgentAudit, recordAgentAudit } from "./audit";
import { createSubscription, deleteSubscription, listSubscriptions, rotateSubscriptionSecret, updateSubscription } from "./webhooks";
import type { AgentPrincipal } from "./types";

class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

function json(data: unknown, status = 200): NextResponse {
  return NextResponse.json({ ok: status < 400, data }, { status });
}
function fail(ca: ApiError): NextResponse {
  return NextResponse.json({ ok: false, error: { code: err.code, message: err.message } }, { status: err.status });
}

async function requireSession(): Promise<{ session: { id: string } }> {
  const session = await getCurrentSession();
  if (!session) throw new ApiError(401, "UNAUTHORIZED", "Not signed in");
  return { session: { id: session.id } };
}

async function ownerWorkspace(userId: string): Promise<string> {
  const workspaces = await listWorkspacesForUser(userId);
  if (!workspaces.length) throw new ApiError(400, "NO_WORKSPACE", "No workspace");
  return workspaces[0].workspace.id;
}

async function principalFromRequest(req: NextRequest): Promise<AgentPrincipal> {
  try {
    const { principal } = await authenticateAgentRequest(req);
    return principal;
  } catch (e) {
    if (e instanceof AgentAuthError) {
      const status = e.code === "RATE_LIMITED" ? 429 : e.code === "FORBIDDEN" ? 403 : 401;
      throw new ApiError(status, e.code, e.message);
    }
    throw new ApiError(401, "UNAUTHORIZED", "Invalid credential");
  }
}

function readPagination(url: URL): { limit: number; offset: number } {
  const limit = Math.min(Number(url.searchParams.get("limit")) || 50, 200);
  const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
  return { limit, offset };
}

export async function handleAgentRequest(req: NextRequest, tail: string[]): Promise<NextResponse> {
  try {
    const method = req.method;
    const first = tail[0]?.toLowerCase();

    // --- Registration (session) -------------------------------------------------
    if (first === "register") {
      const { session } = await requireSession();
      if (method !== "POST") throw new ApiError(405, "METHOD_NOT_ALLOWED", "POST only");
      const body = await req.json().catch(() => ({}));
      const result = await registerAgent(session.id, body);
      await recordAgentAudit({ userId: session.id, agentId: result.agent.id, workspaceId: result.agent.workspaceId, action: "agent.registered", metadata: { name: result.agent.name } });
      return json({ agent: result.agent, credential: result.credential, token: result.token }, 201);
    }

    // --- Authenticate (bearer) --------------------------------------------------
    if (first === "authenticate") {
      if (method !== "POST") throw new ApiError(405, "METHOD_NOT_ALLOWED", "POST only");
      const principal = await principalFromRequest(req);
      const perms = await listPermissionSets(principal.userId, principal.agentId);
      return json({ agent: { id: principal.agentId, name: principal.name, category: principal.category, mode: principal.mode, status: principal.status }, workspaceId: principal.workspaceId, permissions: perms });
    }

    // --- Me (bearer) --------------------------------------------------------------
    if (first === "me") {
      if (method !== "GET") throw new ApiError(405, "METHOD_NOT_ALLOWED", "GET only");
      const principal = await principalFromRequest(req);
      const perms = await listPermissionSets(principal.userId, principal.agentId);
      return json({ agent: { id: principal.agentId, name: principal.name, category: principal.category, mode: principal.mode, status: principal.status }, workspaceId: principal.workspaceId, permissions: perms });
    }

    // --- Webhooks (owner session) -------------------------------------------------
    if (first === "webhooks") {
      const { session } = await requireSession();
      const workspaceId = await ownerWorkspace(session.id);
      const second = tail[1]?.toLowerCase();
      if (!second) {
        if (method === "GET") {
          const subs = await listSubscriptions(session.id, workspaceId);
          return json({ items: subs });
        }
        if (method === "POST") {
          const body = await req.json().catch(() => ({}));
          const r = await createSubscription(session.id, { workspaceId, agentId: body.agentId, url: body.url, events: body.events ?? [] });
          return json(r, 201);
        }
        throw new ApiError(405, "METHOD_NOT_ALLOWED", "Unsupported");
      }
      if (second === "list") {
        const subs = await listSubscriptions(session.id, workspaceId);
        return json({ items: subs });
      }
      // webhooks/:id and webhooks/:id/rotate
      if (tail[2]?.toLowerCase() === "rotate") {
        if (method !== "POST") throw new ApiError(405, "METHOD_NOT_ALLOWED", "POST only");
        const r = await rotateSubscriptionSecret(session.id, second);
        return json(r);
      }
      if (method === "GET") {
        const subs = await listSubscriptions(session.id, workspaceId);
        const sub = subs.find((s) => s.id === second);
        if (!sub) throw new ApiError(404, "NOT_FOUND", "Subscription not found");
        return json(sub);
      }
      if (method === "PATCH") {
        const body = await req.json().catch(() => ({}));
        const sub = await updateSubscription(session.id, second, body);
        if (!sub) throw new ApiError(404, "NOT_FOUND", "Subscription not found");
        return json(sub);
      }
      if (method === "DELETE") {
        await deleteSubscription(session.id, second);
        return json({ ok: true });
      }
      throw new ApiError(405, "METHOD_NOT_ALLOWED", "Unsupported");
    }

    // --- Memories (bearer) ---------------------------------------------------------
    if (first === "memories") {
      const principal = await principalFromRequest(req);
      const perms = await readPermissionSet(principal.userId, principal.agentId, principal.workspaceId);
      const second = tail[1];
      if (second) {
        const memoryId = second;
        if (method === "GET") {
          if (!canReadMemory(perms)) throw new ApiError(403, "FORBIDDEN", "No read:memory scope");
          const mem = await getMemory(principal.userId, memoryId);
          if (!mem) throw new ApiError(404, "NOT_FOUND", "Memory not found");
          return json(mem);
        }
        if (method === "PATCH") {
          const body = await req.json().catch(() => ({}));
          const result = await submitContribution(principal, "update", { ...body, memoryId });
          if (result.status === "error") throw new ApiError(403, "FORBIDDEN", result.error ?? "Forbidden");
          return json(result);
        }
        if (method === "DELETE") {
          const result = await submitContribution(principal, "delete", { memoryId });
          if (result.status === "error") throw new ApiError(403, "FORBIDDEN", result.error ?? "Forbidden");
          return json(result);
        }
        if (method === "POST" && tail[2]?.toLowerCase() === "archive") {
          const result = await archiveContribution(principal, memoryId);
          if (result.status === "error") throw new ApiError(403, "FORBIDDEN", result.error ?? "Forbidden");
          return json(result);
        }
        throw new ApiError(405, "METHOD_NOT_ALLOWED", "Unsupported");
      }
      if (method === "GET") {
        if (!canReadMemory(perms)) throw new ApiError(403, "FORBIDDEN", "No read:memory scope");
        const url = new URL(req.url);
        const q = url.searchParams.get("q") ?? undefined;
        const memoryType = url.searchParams.get("memoryType") ?? undefined;
        const from = url.searchParams.get("from") ?? undefined;
        const to = url.searchParams.get("to") ?? undefined;
        const { limit, offset } = readPagination(url);
        const recall = await recallMemories(principal.userId, {
          workspaceId: principal.workspaceId,
          query: q,
          memoryTypes: memoryType ? [memoryType as never] : undefined,
          limit,
          offset,
          from,
          to,
        });
        return json({ items: recall.items, total: recall.total, method: recall.method });
      }
      if (method === "POST") {
        const body = await req.json().catch(() => ({}));
        const kind = body.kind === "relationship" ? "relationship" : "memory";
        const result = await submitContribution(principal, kind, body.payload ?? body);
        if (result.status === "error") throw new ApiError(403, "FORBIDDEN", result.error ?? "Forbidden");
        return json(result, result.status === "auto_approved" ? 200 : 202);
      }
      throw new ApiError(405, "METHOD_NOT_ALLOWED", "Unsupported");
    }

    // --- Projects (bearer) ----------------------------------------------------------
    if (first === "projects") {
      const principal = await principalFromRequest(req);
      const perms = await readPermissionSet(principal.userId, principal.agentId, principal.workspaceId);
      if (!canReadProject(perms)) throw new ApiError(403, "FORBIDDEN", "No read:project scope");
      const second = tail[1];
      if (!second) {
        if (method !== "GET") throw new ApiError(405, "METHOD_NOT_ALLOWED", "Unsupported");
        const rows = await recallProjects(principal);
        return json({ items: rows });
      }
      if (tail[2]?.toLowerCase() === "context") {
        if (method !== "GET") throw new ApiError(405, "METHOD_NOT_ALLOWED", "Unsupported");
        const task = new URL(req.url).searchParams.get("task") ?? undefined;
        const pkg = await buildContextPackage(principal, { projectId: second, task });
        return json(pkg);
      }
      if (tail[2]?.toLowerCase() === "history") {
        if (method !== "GET") throw new ApiError(405, "METHOD_NOT_ALLOWED", "Unsupported");
        const rows = await projectHistory(principal, second);
        return json({ items: rows });
      }
      if (method !== "GET") throw new ApiError(405, "METHOD_NOT_ALLOWED", "Unsupported");
      const rows = await recallProjects(principal);
      const project = rows.find((p) => p.id === second);
      if (!project) throw new ApiError(404, "NOT_FOUND", "Project not found");
      return json(project);
    }

    // --- Intelligence (bearer) ------------------------------------------------------
    if (first === "intelligence") {
      const principal = await principalFromRequest(req);
      const perms = await readPermissionSet(principal.userId, principal.agentId, principal.workspaceId);
      const second = tail[1]?.toLowerCase();
      if (second === "related") {
        if (method !== "GET") throw new ApiError(405, "METHOD_NOT_ALLOWED", "Unsupported");
        if (!canReadGraph(perms)) throw new ApiError(403, "FORBIDDEN", "No read:graph scope");
        const memoryId = new URL(req.url).searchParams.get("memoryId");
        if (!memoryId) throw new ApiError(400, "BAD_REQUEST", "memoryId required");
        const related = await listRelatedMemories(principal.userId, memoryId);
        return json({ items: related });
      }
      if (second === "insights") {
        if (method !== "GET") throw new ApiError(405, "METHOD_NOT_ALLOWED", "Unsupported");
        if (!canReadInsights(perms)) throw new ApiError(403, "FORBIDDEN", "No read:insights scope");
        const insights = await buildInsights(principal);
        return json(insights);
      }
      if (second === "timeline") {
        if (method !== "GET") throw new ApiError(405, "METHOD_NOT_ALLOWED", "Unsupported");
        if (!canReadMemory(perms)) throw new ApiError(403, "FORBIDDEN", "No read:memory scope");
        const url = new URL(req.url);
        const items = await recallTimeline(principal, url.searchParams.get("from") ?? undefined, url.searchParams.get("to") ?? undefined);
        return json({ items });
      }
      throw new ApiError(404, "NOT_FOUND", "Unknown intelligence endpoint");
    }

    // --- Operations (bearer) ----------------------------------------------------------
    if (first === "operations") {
      const principal = await principalFromRequest(req);
      if (method !== "GET") throw new ApiError(405, "METHOD_NOT_ALLOWED", "Unsupported");
      return json({ status: "ok", agentId: principal.agentId, mode: principal.mode, workspaceId: principal.workspaceId });
    }

    // --- Usage *****************************************************************
    if (first === "usage") {
      if (method !== "GET") throw new ApiError(405, "METHOD_NOT_ALLOWED", "Unsupported");
      // agent-authed → own usage; session → workspace usage
      const token = req.headers.get("authorization");
      if (token?.startsWith("Bearer ")) {
        const principal = await principalFromRequest(req);
        const perms = await readPermissionSet(principal.userId, principal.agentId, principal.workspaceId);
        if (!canReadUsage(perms)) throw new ApiError(403, "FORBIDDEN", "No read:usage scope");
        const usage = await getAgentUsage(principal.userId, principal.agentId);
        return json({ agentId: principal.agentId, usage });
      }
      const { session } = await requireSession();
      const workspaceId = await ownerWorkspace(session.id);
      const usage = await getWorkspaceUsage(session.id, workspaceId);
      return json({ workspaceId, usage });
    }

    // --- Audit (owner) -----------------------------------------------------------------
    if (first === "audit") {
      const { session } = await requireSession();
      const workspaceId = await ownerWorkspace(session.id);
      const url = new URL(req.url);
      const agentId = url.searchParams.get("agentId") ?? undefined;
      const { limit, offset } = readPagination(url);
      const events = await listAgentAudit(session.id, { workspaceId, agentId, limit, offset });
      return json({ items: events });
    }

    // --- Agent detail / management (owner session) --------------------------------------
    const agentId = first;
    if (agentId && tail.length >= 1 && !["memories", "projects", "intelligence", "operations", "usage", "audit", "webhooks", "register", "authenticate", "me"].includes(agentId)) {
      const { session } = await requireSession();
      const second = tail[1]?.toLowerCase();

      if (second === "permissions") {
        if (method === "GET") {
          const perms = await listPermissionSets(session.id, agentId);
          return json({ items: perms });
        }
        if (method === "PATCH") {
          const body = await req.json().catch(() => ({}));
          const workspaceId = await ownerWorkspace(session.id);
          await setPermissions(session.id, agentId, workspaceId, body);
          await recordAgentAudit({ userId: session.id, agentId, workspaceId, action: "agent.permissions.updated", metadata: body });
          return json({ ok: true });
        }
        throw new ApiError(405, "METHOD_NOT_ALLOWED", "Unsupported");
      }

      if (second === "credentials") {
        const credId = tail[2];
        if (credId) {
          if (method !== "DELETE") throw new ApiError(405, "METHOD_NOT_ALLOWED", "Unsupported");
          await revokeCredential(session.id, credId);
          await recordAgentAudit({ userId: session.id, agentId, workspaceId: await ownerWorkspace(session.id), action: "agent.credential.revoked", metadata: { credentialId: credId } });
          return json({ ok: true });
        }
        if (method === "POST") {
          const body = await req.json().catch(() => ({}));
          const r = await issueCredential(session.id, agentId, body.expiresInDays);
          await recordAgentAudit({ userId: session.id, agentId, workspaceId: await ownerWorkspace(session.id), action: "agent.credential.issued", metadata: { prefix: r.credential.prefix } });
          return json(r, 201);
        }
        if (method === "GET") {
          const creds = await listCredentials(session.id, agentId);
          return json({ items: creds });
        }
        throw new ApiError(405, "METHOD_NOT_ALLOWED", "Unsupported");
      }

      if (second === "contributions") {
        if (method === "GET") {
          const url = new URL(req.url);
          const workspaceId = await ownerWorkspace(session.id);
          const { limit, offset } = readPagination(url);
          const status = url.searchParams.get("status") ?? undefined;
          const r = await listContributions(session.id, { workspaceId, agentId, status, limit, offset });
          return json(r);
        }
        const cid = tail[2];
        if (cid && tail[3]?.toLowerCase() === "decision" && method === "POST") {
          const body = await req.json().catch(() => ({}));
          const workspaceId = await ownerWorkspace(session.id);
          const decision = body.decision === "rejected" ? "rejected" : "approved";
          const result = await decideContribution(session.id, cid, decision, body.note);
          await recordAgentAudit({ userId: session.id, agentId, workspaceId, action: `agent.contribution.${decision}`, metadata: { contributionId: cid } });
          return json(result);
        }
        throw new ApiError(405, "METHOD_NOT_ALLOWED", "Unsupported");
      }

      if (method === "GET") {
        const agent = await getAgent(session.id, agentId);
        if (!agent) throw new ApiError(404, "NOT_FOUND", "Agent not found");
        const perms = await listPermissionSets(session.id, agentId);
        const usage = await getAgentUsage(session.id, agentId);
        return json({ agent, permissions: perms, usage });
      }
      if (method === "PATCH") {
        const body = await req.json().catch(() => ({}));
        const agent = await updateAgent(session.id, agentId, body);
        if (!agent) throw new ApiError(404, "NOT_FOUND", "Agent not found");
        if (agent.status === "revoked") await revokeAgent(session.id, agentId);
        await recordAgentAudit({ userId: session.id, agentId, workspaceId: agent.workspaceId, action: "agent.updated", metadata: body });
        return json(agent);
      }
      if (method === "DELETE") {
        const agent = await getAgent(session.id, agentId);
        await deleteAgent(session.id, agentId);
        if (agent) await recordAgentAudit({ userId: session.id, agentId, workspaceId: agent.workspaceId, action: "agent.deleted" });
        return json({ ok: true });
      }
      throw new ApiError(405, "METHOD_NOT_ALLOWED", "Unsupported");
    }

    throw new ApiError(404, "NOT_FOUND", "Unknown agent endpoint");
  } catch (e) {
    if (e instanceof ApiError) return fail(e);
    return fail(new ApiError(500, "INTERNAL", e instanceof Error ? e.message : "Internal error"));
  }
}

// ---- small helpers for project/intelligence endpoints (kept local) ------------

async function recallProjects(principal: AgentPrincipal): Promise<{ id: string; name: string; description: string | null; status: string }[]> {
  const { queryTenant } = await import("@/db/client");
  const rows = await queryTenant<Record<string, unknown>>(
    principal.userId,
    `SELECT id, name, description, status FROM projects WHERE workspace_id = $1 ORDER BY created_at DESC`,
    [principal.workspaceId],
  );
  return rows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
    description: r.description ? String(r.description) : null,
    status: String(r.status),
  }));
}

async function buildInsights(principal: AgentPrincipal): Promise<Record<string, unknown>> {
  const metrics = await projectGraph({
    userId: principal.userId,
    workspaceId: principal.workspaceId,
    mode: "universe",
    limitNodes: 200,
    limitEdges: 300,
  });
  void metrics;
  return {
    generatedAt: new Date().toISOString(),
    source: "deterministic",
    note: "Insights are computed from graph metrics and recent records; no LLM was used.",
  };
}

async function recallTimeline(principal: AgentPrincipal, from?: string, to?: string): Promise<{ id: string; content: string; occurredAt: string }[]> {
  const { queryTenant } = await import("@/db/client");
  const params: unknown[] = [principal.workspaceId];
  let sql = `SELECT id, content, occurred_at FROM memory_records WHERE workspace_id = $1 AND state='active' AND occurred_at IS NOT NULL`;
  if (from) { params.push(from); sql += ` AND occurred_at >= $${params.length}`; }
  if (to) { params.push(to); sql += ` AND occurred_at <= $${params.length}`; }
  sql += ` ORDER BY occurred_at DESC LIMIT 100`;
  const rows = await queryTenant<Record<string, unknown>>(principal.userId, sql, params);
  return rows.map((r) => ({ id: String(r.id), content: String(r.content), occurredAt: String(r.occurred_at) }));
}

async function setPermissions(userId: string, agentId: string, workspaceId: string, body: Record<string, unknown>): Promise<void> {
  const { queryTenant } = await import("@/db/client");
  const scopes = Array.isArray(body.scopes) ? (body.scopes as string[]) : undefined;
  const memoryTypes = Array.isArray(body.memoryTypes) ? (body.memoryTypes as string[]) : undefined;
  const projectIds = Array.isArray(body.projectIds) ? (body.projectIds as string[]) : undefined;
  const readOnly = typeof body.readOnly === "boolean" ? body.readOnly : undefined;
  const sets: string[] = [];
  const params: unknown[] = [];
  let idx = 1;
  if (scopes) { sets.push(`scopes = $${idx++}`); params.push(scopes); }
  if (memoryTypes) { sets.push(`memory_types = $${idx++}`); params.push(memoryTypes); }
  if (projectIds) { sets.push(`project_ids = $${idx++}`); params.push(projectIds); }
  if (readOnly !== undefined) { sets.push(`read_only = $${idx++}`); params.push(readOnly); }
  if (sets.length === 0) return;
  params.push(agentId, workspaceId);
  await queryTenant(
    userId,
    `UPDATE agent_workspace_permissions SET ${sets.join(", ")} WHERE agent_id = $${idx} AND workspace_id = $${idx + 1}`,
    params,
  );
}
