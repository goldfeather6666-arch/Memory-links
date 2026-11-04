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
export const mcpHandler = createMcpHandler(
  (ctx: { authInfo?: { token?: string } }) =>
    buildMcpServer(ctx.authInfo?.token ? principalFromToken(ctx.authInfo.token) : null),
  { legacy: "stateless", responseMode: "auto", maxRequestBodySize: 1_000_000 },
);

// Lightweight bearer-token -> principal resolution used by the factory.
function principalFromToken(token: string): AgentPrincipal | null {
  // Real resolution happens in the route (signature check + DB lookup) and is
  // passed through authInfo.extra; if no extra principal is present we fail
  // closed (null principal -> no tools/resources).
  return null;
}
