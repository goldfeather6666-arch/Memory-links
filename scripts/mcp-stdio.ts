/**
 * MCP stdio transport entry point for local/embedded development.
 *
 * Run:
 *   MNEMOSYNE_STDIO_TOKEN=<agent-token> npm run mcp:stdio
 *
 * The token is one of the agent credentials issued via the Agent Bridge
 * dashboard / API, and is verified against the same credential store as the
 * HTTP transport (so the same per-agent permissions apply).
 */
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { verifyCredential } from "../src/server/agent/credentials";
import { buildMcpServer } from "../src/server/agent/mcp/server";

async function loadPrincipal() {
  const token = process.env.MNEMOSYNE_STDIO_TOKEN;
  if (!token) return null;
  return verifyCredential(token);
}

serveStdio(async () => buildMcpServer(await loadPrincipal()), {
  legacy: "serve",
  onerror: (error) => {
    console.error("[mnemosyne-stdio]", error.message);
  },
});
