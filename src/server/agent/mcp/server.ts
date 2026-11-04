import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { registerAllResources } from "./resources";
import { registerAllTools } from "./tools";
import type { AgentPrincipal } from "../types";

export function buildMcpServer(principal: AgentPrincipal | null): McpServer {
  const server = new McpServer(
    { name: "mnemosyne-agent-bridge", version: "1.0.0" },
    { capabilities: { tools: {}, resources: {} } },
  );
  registerAllTools(server, principal);
  registerAllResources(server, principal);
  return server;
}

/**
 * Shared streamable-HTTP handler for Next.js. Authentication is performed by
 * the route before calling `fetch`; the authenticated principal is passed
 * through `authInfo.extra` to the per-request server factory so each request
 * gets a fresh server bound to the authenticated agent.
 */
export const mcpHandler = createMcpHandler(
  (ctx: { authInfo?: { extra?: Record<string, unknown> } }) => {
    const e = ctx.authInfo?.extra;
    const principal: AgentPrincipal | null = e
      ? {
          userId: String(e.userId ?? ""),
          workspaceId: String(e.workspaceId ?? ""),
          agentId: String(e.agentId ?? ""),
          name: String(e.name ?? ""),
          mode: (e.mode as AgentPrincipal["mode"]) ?? "approval",
          category: (e.category as AgentPrincipal["category"]) ?? "custom",
          status: (e.status as AgentPrincipal["status"]) ?? "active",
        }
      : null;
    return buildMcpServer(principal);
  },
  { legacy: "stateless", responseMode: "auto", maxRequestBodySize: 1_000_000 },
);
