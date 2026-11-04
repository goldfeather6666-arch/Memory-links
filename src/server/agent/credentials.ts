import { queryRaw, queryTenant } from "@/db/client";
import type { AgentPrincipal, CredentialMetadata } from "./types";
import { randomToken, sha256Hex } from "./crypto";

function mapCredential(row: Record<string, unknown>): CredentialMetadata {
  return {
    id: String(row.id),
    prefix: String(row.token_prefix),
    createdAt: row.created_at ? new Date(String(row.created_at)).toISOString() : "",
    expiresAt: row.expires_at ? new Date(String(row.expires_at)).toISOString() : null,
    revokedAt: row.revoked_at ? new Date(String(row.revoked_at)).toISOString() : null,
  };
}

/** Issue a new credential for an agent. Returns the raw token exactly once. */
export async function issueCredential(
  userId: string,
  agentId: string,
  expiresInDays?: number,
): Promise<{ credential: CredentialMetadata; token: string }> {
  const { token, hash, prefix } = randomToken();
  const expiresAt = expiresInDays
    ? new Date(Date.now() + expiresInDays * 86400000).toISOString()
    : null;
  const rows = await queryTenant<Record<string, unknown>>(
    userId,
    `INSERT INTO agent_credentials (agent_id, token_hash, token_prefix, expires_at)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [agentId, hash, prefix, expiresAt],
  );
  return { credential: mapCredential(rows[0]), token };
}

/** Look up and validate an agent credential by its raw token. */
export async function verifyCredential(token: string): Promise<AgentPrincipal | null> {
  const hash = sha256Hex(token);
  const rows = await queryRaw<Record<string, unknown>>(
    `SELECT c.id AS credential_id, c.agent_id, c.expires_at, c.revoked_at,
            a.owner_id, a.workspace_id, a.status, a.name, a.mode, a.category
       FROM agent_credentials c
       JOIN agents a ON a.id = c.agent_id
      WHERE c.token_hash = $1`,
    [hash],
  );
  const row = rows[0];
  if (!row) return null;
  if (row.revoked_at) return null;
  if (row.expires_at && new Date(String(row.expires_at)).getTime() < Date.now()) return null;
  if (row.status !== "active") return null;
  const userId = String(row.owner_id);
  const workspaceId = String(row.workspace_id);
  // Touch last_active_at (best-effort).
  await queryTenant(
    userId,
    `UPDATE agents SET last_active_at = now() WHERE id = $1 AND workspace_id = $2`,
    [String(row.agent_id), workspaceId],
  ).catch(() => undefined);
  return {
    agentId: String(row.agent_id),
    userId,
    workspaceId,
    name: String(row.name),
    mode: String(row.mode) as AgentPrincipal["mode"],
    category: String(row.category) as AgentPrincipal["category"],
    status: String(row.status) as AgentPrincipal["status"],
  };
}

export async function listCredentials(userId: string, agentId: string): Promise<CredentialMetadata[]> {
  const rows = await queryTenant<Record<string, unknown>>(
    userId,
    `SELECT id, token_prefix, created_at, expires_at, revoked_at
       FROM agent_credentials WHERE agent_id = $1 ORDER BY created_at DESC`,
    [agentId],
  );
  return rows.map(mapCredential);
}

export async function revokeCredential(userId: string, credentialId: string): Promise<void> {
  await queryTenant(
    userId,
    `UPDATE agent_credentials SET revoked_at = now() WHERE id = $1`,
    [credentialId],
  );
}

export async function revokeAllCredentials(userId: string, agentId: string): Promise<void> {
  await queryTenant(
    userId,
    `UPDATE agent_credentials SET revoked_at = now() WHERE agent_id = $1 AND revoked_at IS NULL`,
    [agentId],
  );
}
