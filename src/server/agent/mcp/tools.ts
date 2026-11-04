import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { MemoryType } from "@/db/schema";
import { recallMemories } from "@/server/memory/retrieval";
import { getMemory } from "@/server/memory/storage";
import { listRelatedMemories } from "@/server/memory/relationships";
import { submitContribution, archiveContribution } from "../contribution";
import { buildContextPackage } from "../context";
import {
  buildInsights,
  listAuthorizedProjects,
  loadPerms,
  recentChanges,
  recallTimeline,
} from "./shared";
import {
  canReadGraph,
  canReadInsights,
  canReadMemory,
  canReadProject,
  canWriteMemory,
} from "../permissions";
import type { AgentPrincipal } from "../types";

const memoryTypeEnum = z.enum(["episodic", "semantic", "procedural", "associative"]);

function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}
function err(message: string, code = "INVALID_REQUEST") {
  return { isError: true as const, content: [{ type: "text" as const, text: `${code}: ${message}` }] };
}

export function registerAllTools(server: McpServer, principal: AgentPrincipal | null): void {
  const p = principal;
  const P = async () => (p ? loadPerms(p) : null);

  // ---- Memory retrieval -------------------------------------------------------
  server.registerTool(
    "search_memories",
    {
      title: "Search memories",
      description: "Search memories by natural language and filters.",
      inputSchema: z.object({
        q: z.string().optional(),
        memoryType: memoryTypeEnum.optional(),
        limit: z.number().int().min(1).max(100).optional(),
        offset: z.number().int().min(0).optional(),
        from: z.string().optional(),
        to: z.string().optional(),
      }),
    },
    async (args: { q?: string; memoryType?: string; limit?: number; offset?: number; from?: string; to?: string }) => {
    const { q, memoryType, limit, offset, from, to } = args;
      if (!p) return err("Not authenticated", "UNAUTHORIZED");
      const perms = await P();
      if (!canReadMemory(perms, memoryType)) return err("No read:memory scope", "FORBIDDEN");
      const recall = await recallMemories(p.userId, {
        workspaceId: p.workspaceId,
        query: q,
        memoryTypes: memoryType ? [memoryType as MemoryType] : undefined,
        limit: limit ?? 20,
        offset: offset ?? 0,
        from,
        to,
      });
      return ok({ items: recall.items, total: recall.total, method: recall.method });
    },
  );

  server.registerTool(
    "recall",
    {
      title: "Recall context",
      description: "Retrieve relevant information for a specific question or task.",
      inputSchema: z.object({
        query: z.string().min(1),
        limit: z.number().int().min(1).max(50).optional(),
        from: z.string().optional(),
        to: z.string().optional(),
      }),
    },
    async ({ query, limit, from, to }: Record<string, unknown>) => {
      if (!p) return err("Not authenticated", "UNAUTHORIZED");
      const perms = await P();
      if (!canReadMemory(perms)) return err("No read:memory scope", "FORBIDDEN");
      const recall = await recallMemories(p.userId, {
        workspaceId: p.workspaceId,
        query: String(query),
        limit: Number(limit ?? 20),
        from: from ? String(from) : undefined,
        to: to ? String(to) : undefined,
      });
      return ok({ items: recall.items, total: recall.total, method: recall.method });
    },
  );

  server.registerTool(
    "get_memory",
    {
      title: "Get a memory",
      description: "Retrieve an individual memory with authorized metadata.",
      inputSchema: z.object({ memoryId: z.string().min(1) }),
    },
    async ({ memoryId }: { memoryId: string }) => {
      if (!p) return err("Not authenticated", "UNAUTHORIZED");
      const perms = await P();
      if (!canReadMemory(perms)) return err("No read:memory scope", "FORBIDDEN");
      const mem = await getMemory(p.userId, memoryId);
      if (!mem) return err("Memory not found", "NOT_FOUND");
      return ok(mem);
    },
  );

  server.registerTool(
    "get_related_memories",
    {
      title: "Get related memories",
      description: "Retrieve memories connected to a specified memory or entity.",
      inputSchema: z.object({
        memoryId: z.string().optional(),
        entityName: z.string().optional(),
      }),
    },
    async ({ memoryId, entityName }: { memoryId?: string; entityName?: string }) => {
      if (!p) return err("Not authenticated", "UNAUTHORIZED");
      const perms = await P();
      if (!canReadGraph(perms)) return err("No read:graph scope", "FORBIDDEN");
      if (memoryId) {
        const related = await listRelatedMemories(p.userId, memoryId);
        return ok({ items: related });
      }
      if (entityName) {
        const recall = await recallMemories(p.userId, { workspaceId: p.workspaceId, query: entityName, limit: 20 });
        return ok({ items: recall.items, hint: "entity matches" });
      }
      return err("Provide memoryId or entityName");
    },
  );

  server.registerTool(
    "get_project_context",
    {
      title: "Get project context",
      description: "Retrieve bounded context for a project.",
      inputSchema: z.object({
        projectId: z.string().min(1),
        task: z.string().optional(),
        maxMemories: z.number().int().min(1).max(100).optional(),
      }),
    },
    async ({ projectId, task, maxMemories }: { projectId: string; task?: string; maxMemories?: number }) => {
      if (!p) return err("Not authenticated", "UNAUTHORIZED");
      const perms = await P();
      if (!canReadProject(perms)) return err("No read:project scope", "FORBIDDEN");
      const pkg = await buildContextPackage(p, { projectId, task, maxMemories });
      return ok(pkg);
    },
  );

  server.registerTool(
    "get_user_preferences",
    {
      title: "Get user preferences",
      description: "Retrieve authorized user preferences.",
      inputSchema: z.object({ limit: z.number().int().min(1).max(50).optional() }),
    },
    async ({ limit }: { limit?: number }) => {
      if (!p) return err("Not authenticated", "UNAUTHORIZED");
      const perms = await P();
      if (!canReadMemory(perms)) return err("No read:memory scope", "FORBIDDEN");
      const recall = await recallMemories(p.userId, {
        workspaceId: p.workspaceId,
        memoryTypes: ["semantic"],
        query: "preference",
        limit: Math.min(limit ?? 20, 50),
      });
      return ok({ items: recall.items });
    },
  );

  server.registerTool(
    "get_timeline",
    {
      title: "Get timeline",
      description: "Retrieve authorized historical events in a time range.",
      inputSchema: z.object({
        from: z.string().optional(),
        to: z.string().optional(),
        limit: z.number().int().min(1).max(200).optional(),
      }),
    },
    async ({ from, to, limit }: { from?: string; to?: string; limit?: number }) => {
      if (!p) return err("Not authenticated", "UNAUTHORIZED");
      const perms = await P();
      if (!canReadMemory(perms)) return err("No read:memory scope", "FORBIDDEN");
      const items = await recallTimeline(p, from, to, limit ?? 100);
      return ok({ items });
    },
  );

  // ---- Memory contribution ----------------------------------------------------
  const memoryInput = {
    memoryType: memoryTypeEnum,
    content: z.string().min(1).max(100000),
    summary: z.string().max(10000).optional(),
    confidence: z.number().min(0).max(1).optional(),
    validFrom: z.string().nullable().optional(),
    validUntil: z.string().nullable().optional(),
    entities: z.array(z.object({ name: z.string().min(1), type: z.string().optional() })).optional(),
  };

  server.registerTool(
    "propose_memory",
    {
      title: "Propose a memory",
      description: "Submit a candidate memory for validation and possible approval.",
      inputSchema: z.object(memoryInput),
    },
    async (args: Record<string, unknown>) => {
      if (!p) return err("Not authenticated", "UNAUTHORIZED");
      const result = await submitContribution(p, "memory", args);
      if (result.status === "error") return err(result.error ?? "Forbidden", "FORBIDDEN");
      return ok(result);
    },
  );

  server.registerTool(
    "remember",
    {
      title: "Remember",
      description: "Create a memory when the agent has permission to write directly.",
      inputSchema: z.object(memoryInput),
    },
    async (args: Record<string, unknown>) => {
      if (!p) return err("Not authenticated", "UNAUTHORIZED");
      const perms = await P();
      if (p.mode !== "autonomous" || !canWriteMemory(perms)) {
        return err("Autonomous write permission required", "FORBIDDEN");
      }
      const result = await submitContribution(p, "memory", args);
      if (result.status === "error") return err(result.error ?? "Forbidden", "FORBIDDEN");
      return ok(result);
    },
  );

  server.registerTool(
    "update_memory",
    {
      title: "Update a memory",
      description: "Update an existing memory per permissions and revision rules.",
      inputSchema: z.object({
        memoryId: z.string().min(1),
        content: z.string().min(1).optional(),
        summary: z.string().nullable().optional(),
        memoryType: memoryTypeEnum.optional(),
        confidence: z.number().min(0).max(1).nullable().optional(),
        archive: z.boolean().optional(),
      }),
    },
    async ({ memoryId, archive, ...rest }: { memoryId: string; archive?: boolean; [k: string]: unknown }) => {
      if (!p) return err("Not authenticated", "UNAUTHORIZED");
      const result = archive
        ? await archiveContribution(p, memoryId)
        : await submitContribution(p, "update", { ...rest, memoryId });
      if (result.status === "error") return err(result.error ?? "Forbidden", "FORBIDDEN");
      return ok(result);
    },
  );

  server.registerTool(
    "link_memories",
    {
      title: "Link memories",
      description: "Propose or create an authorized relationship between memories.",
      inputSchema: z.object({
        sourceMemoryId: z.string().min(1),
        targetMemoryId: z.string().min(1),
        relationshipType: z.string().min(1).max(64),
        strength: z.number().min(0).max(1).optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
      }),
    },
    async (args: Record<string, unknown>) => {
      if (!p) return err("Not authenticated", "UNAUTHORIZED");
      const result = await submitContribution(p, "relationship", args);
      if (result.status === "error") return err(result.error ?? "Forbidden", "FORBIDDEN");
      return ok(result);
    },
  );

  server.registerTool(
    "archive_memory",
    {
      title: "Archive a memory",
      description: "Archive an authorized memory.",
      inputSchema: z.object({ memoryId: z.string().min(1) }),
    },
    async ({ memoryId }: { memoryId: string }) => {
      if (!p) return err("Not authenticated", "UNAUTHORIZED");
      const result = await archiveContribution(p, memoryId);
      if (result.status === "error") return err(result.error ?? "Forbidden", "FORBIDDEN");
      return ok(result);
    },
  );

  server.registerTool(
    "forget_memory",
    {
      title: "Forget a memory",
      description: "Request deletion of a memory, subject to configured policies.",
      inputSchema: z.object({ memoryId: z.string().min(1) }),
    },
    async ({ memoryId }: { memoryId: string }) => {
      if (!p) return err("Not authenticated", "UNAUTHORIZED");
      const result = await submitContribution(p, "delete", { memoryId });
      if (result.status === "error") return err(result.error ?? "Forbidden", "FORBIDDEN");
      return ok(result);
    },
  );

  // ---- Workspace / project context --------------------------------------------
  server.registerTool(
    "list_authorized_workspaces",
    {
      title: "List authorized workspaces",
      description: "List only workspaces the agent is authorized to access.",
      inputSchema: z.object({}),
    },
    async () => {
      if (!p) return err("Not authenticated", "UNAUTHORIZED");
      const perms = await P();
      const workspaces = [
        {
          id: p.workspaceId,
          permissions: perms
            ? { scopes: perms.scopes, memoryTypes: perms.memoryTypes, projectIds: perms.projectIds, readOnly: perms.readOnly }
            : { scopes: [], readOnly: true },
        },
      ];
      return ok({ items: workspaces });
    },
  );

  server.registerTool(
    "list_projects",
    {
      title: "List projects",
      description: "List projects within an authorized workspace.",
      inputSchema: z.object({}),
    },
    async () => {
      if (!p) return err("Not authenticated", "UNAUTHORIZED");
      const perms = await P();
      if (!canReadProject(perms)) return err("No read:project scope", "FORBIDDEN");
      const projects = await listAuthorizedProjects(p);
      return ok({ items: projects });
    },
  );

  server.registerTool(
    "get_project_details",
    {
      title: "Get project details",
      description: "Retrieve authorized project information.",
      inputSchema: z.object({ projectId: z.string().min(1) }),
    },
    async ({ projectId }: { projectId: string }) => {
      if (!p) return err("Not authenticated", "UNAUTHORIZED");
      const perms = await P();
      if (!canReadProject(perms)) return err("No read:project scope", "FORBIDDEN");
      const projects = await listAuthorizedProjects(p);
      const project = projects.find((pr) => pr.id === projectId);
      if (!project) return err("Project not found", "NOT_FOUND");
      return ok(project);
    },
  );

  // ---- Intelligence ------------------------------------------------------------
  server.registerTool(
    "get_memory_insights",
    {
      title: "Get memory insights",
      description: "Retrieve evidence-backed intelligence insights.",
      inputSchema: z.object({}),
    },
    async () => {
      if (!p) return err("Not authenticated", "UNAUTHORIZED");
      const perms = await P();
      if (!canReadInsights(perms)) return err("No read:insights scope", "FORBIDDEN");
      const insights = await buildInsights(p);
      return ok(insights);
    },
  );

  server.registerTool(
    "get_recent_changes",
    {
      title: "Get recent changes",
      description: "Retrieve relevant recent changes in memory.",
      inputSchema: z.object({ limit: z.number().int().min(1).max(100).optional() }),
    },
    async ({ limit }: { limit?: number }) => {
      if (!p) return err("Not authenticated", "UNAUTHORIZED");
      const perms = await P();
      if (!canReadMemory(perms)) return err("No read:memory scope", "FORBIDDEN");
      const items = await recentChanges(p, limit ?? 20);
      return ok({ items });
    },
  );
}
