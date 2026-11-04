import { verifyCredential } from "./credentials";
import { checkAndRecordRateLimit, recordAgentUse } from "./usage";
import type { AgentPrincipal } from "./types";

export class AgentAuthError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

/** Extract a Bearer token from a Request. */
export function bearerToken(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (!auth) return null;
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  return m ? m[1].trim() : null;
}

/** Authenticate an agent request; enforces rate limit and usage accounting. */
export async function authenticateAgentRequest(req: Request): Promise<{ principal: AgentPrincipal }> {
  const token = bearerToken(req);
  if (!token) throw new AgentAuthError("UNAUTHORIZED", "Missing bearer token");
  const principal = await verifyCredential(token);
  if (!principal) throw new AgentAuthError("UNAUTHORIZED", "Invalid or expired credential");
  if (principal.status !== "active") {
    throw new AgentAuthError("FORBIDDEN", "Agent is not active");
  }
  const rate = await checkAndRecordRateLimit(principal.userId, {
    agentId: principal.agentId,
    workspaceId: principal.workspaceId,
  });
  if (!rate.allowed) {
    throw new AgentAuthError("RATE_LIMITED", `Rate limit exceeded (${rate.limit}/min)`);
  }
  await recordAgentUse(principal.userId, {
    agentId: principal.agentId,
    workspaceId: principal.workspaceId,
    operation: "api_request",
  });
  return { principal };
}
