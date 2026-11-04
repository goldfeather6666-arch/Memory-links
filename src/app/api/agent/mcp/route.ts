import { NextRequest, NextResponse } from "next/server";
import { authenticateAgentRequest, AgentAuthError } from "@/server/agent/auth";
import { mcpHandler } from "@/server/agent/mcp/server";

async function serveMcp(req: NextRequest): Promise<Response> {
  let principal;
  try {
    ({ principal } = await authenticateAgentRequest(req));
  } catch (e) {
    if (e instanceof AgentAuthError) {
      const status = e.code === "RATE_LIMITED" ? 429 : e.code === "FORBIDDEN" ? 403 : 401;
      return NextResponse.json({ error: e.message }, { status });
    }
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const authInfo = {
    token: "<mcp-bearer>",
    clientId: principal.agentId,
    scopes: ["bridge"],
    extra: {
      userId: principal.userId,
      workspaceId: principal.workspaceId,
      agentId: principal.agentId,
      name: principal.name,
      mode: principal.mode,
      category: principal.category,
      status: principal.status,
    },
  };
  return mcpHandler.fetch(req, { authInfo });
}

export async function GET(req: NextRequest) {
  return serveMcp(req);
}
export async function POST(req: NextRequest) {
  return serveMcp(req);
}
export async function DELETE(req: NextRequest) {
  return serveMcp(req);
}
