import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { registerAllResources } from "./resources";
import { registerAllTools } from "./tools";
import { principalFromAuthInfo } from "./shared";
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
 * through `authInfo.extra` to the per-request server factory.
 */
export const mcpHandler = createMcpHandler({
  legacy: "stateless",
  responseMode: "auto",
  maxRequestBodySize: 1_000_000,
  factory: (ctx) => buildMcpServer(ctx.authInfo ? principalFromAuthInfo(ctx.authInfo) : null),
});
