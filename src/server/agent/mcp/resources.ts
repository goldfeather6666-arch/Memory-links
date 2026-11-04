import type { McpServer } from "@modelcontextprotocol/server";
import { recallMemories } from "@/server/memory/retrieval";
import { buildContextPackage } from "../context";
import {
  listAuthorizedProjects,
  loadPerms,
  recallTimeline,
} from "./shared";
import { canReadMemory, canReadProject } from "../permissions";
import type { AgentPrincipal } from "../types";

const SECTIONS = ["overview", "projects", "preferences", "memory-summary", "timeline"] as const;

function resourceError(message: string) {
  return {
    contents: [{ uri: "", mimeType: "text/plain", text: message }],
  };
}

export function registerAllResources(server: McpServer, principal: AgentPrincipal | null): void {
  if (!principal) {
    // Unauthenticated: only register the (empty) template so route errors are clear.
    return;
  }
  const p = principal;
  const permsP = () => loadPerms(p);

  server.registerResource(
    "workspace-section",
    "mnemosyne://workspace/{workspaceId}/{section}",
    {
      title: "Workspace resource",
      description: "Read-only, authorized views of a workspace (overview, projects, preferences, memory-summary, timeline).",
      mimeType: "application/json",
    },
    async (uri: URL) => {
      const path = uri.pathname.split("/").filter(Boolean); // [workspace, {id}, {section}]
      const workspaceId = path[1];
      const section = path[2];
      if (!workspaceId || workspaceId !== p.workspaceId) {
        return resourceError("FORBIDDEN: workspace not authorized");
      }
      if (!section || !(SECTIONS as readonly string[]).includes(section)) {
        return resourceError("INVALID_REQUEST: unknown section");
      }
      const perms = await permsP();
      let payload: unknown;

      if (section === "overview") {
        if (!canReadMemory(perms)) return resourceError("FORBIDDEN: no read:memory scope");
        const pkg = await buildContextPackage(p, {});
        payload = {
          workspaceId: p.workspaceId,
          agentId: p.agentId,
          summary: pkg.summary,
          memoryCount: pkg.memories.length,
          entityCount: pkg.entities.length,
          sourceCount: pkg.sources.length,
          retrievedAt: pkg.retrievedAt,
        };
      } else if (section === "projects") {
        if (!canReadProject(perms)) return resourceError("FORBIDDEN: no read:project scope");
        payload = await listAuthorizedProjects(p);
      } else if (section === "preferences") {
        if (!canReadMemory(perms)) return resourceError("FORBIDDEN: no read:memory scope");
        const recall = await recallMemories(p.userId, {
          workspaceId: p.workspaceId,
          memoryTypes: ["semantic"],
          query: "preference",
          limit: 20,
        });
        payload = recall.items;
      } else if (section === "memory-summary") {
        if (!canReadMemory(perms)) return resourceError("FORBIDDEN: no read:memory scope");
        const pkg = await buildContextPackage(p, {});
        payload = { summary: pkg.summary, memories: pkg.memories.slice(0, 40) };
      } else {
        if (!canReadMemory(perms)) return resourceError("FORBIDDEN: no read:memory scope");
        payload = await recallTimeline(p, undefined, undefined, 100);
      }

      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: "application/json",
            text: JSON.stringify(payload, null, 2),
          },
        ],
      };
    },
  );
}
