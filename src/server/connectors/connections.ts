/**
 * MNEMOSYNE — Part 8 connectors: connection persistence.
 *
 * CRUD over the `connections` table plus encrypted token storage in
 * `connection_tokens`. Every read/write runs through queryTenant(userId) so
 * RLS scopes access to the caller. All rows are mapped explicitly from
 * snake_case DB columns to the camelCase ConnectionRecord contract.
 */
import { queryTenant } from "@/db/client";
import { encryptSecret } from "./crypto";
import { revokeAuthorization } from "./oauth";
import type {
  ConnectionRecord,
  ConnectionStatus,
  ConnectorToken,
  ProviderId,
} from "./types";

interface ConnectionRow {
  id: string;
  workspace_id: string;
  owner_id: string;
  provider: string;
  external_account_id: string;
  account_name: string | null;
  name: string;
  status: string;
  scope: string[];
  selected_resources: unknown[];
  sync_interval_min: number | null;
  last_sync_at: string | null;
  next_sync_at: string | null;
  created_at: string;
  updated_at: string;
}

interface TokenRow {
  access_token_enc: string;
  refresh_token_enc: string | null;
  expires_at: string | null;
  scope: string[];
}

function toIso(value: string | null | Date | undefined): string | null {
  if (!value) return null;
  return new Date(value).toISOString();
}

function mapConnection(row: ConnectionRow): ConnectionRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    ownerId: row.owner_id,
    provider: row.provider as ProviderId,
    externalAccountId: row.external_account_id,
    accountName: row.account_name,
    name: row.name,
    status: row.status as ConnectionStatus,
    scope: row.scope ?? [],
    selectedResources: Array.isArray(row.selected_resources)
      ? row.selected_resources
      : [],
    syncIntervalMin: row.sync_interval_min,
    lastSyncAt: toIso(row.last_sync_at),
    nextSyncAt: toIso(row.next_sync_at),
    createdAt: toIso(row.created_at) ?? "",
    updatedAt: toIso(row.updated_at) ?? "",
  };
}

export async function createConnection(
  userId: string,
  workspaceId: string,
  provider: ProviderId,
  externalAccountId: string,
  name: string,
  scope: string[],
  selectedResources: unknown[],
): Promise<ConnectionRecord> {
  const rows = await queryTenant<ConnectionRow>(
    userId,
    `INSERT INTO connections
       (workspace_id, owner_id, provider, external_account_id, account_name,
        name, status, scope, selected_resources)
     VALUES ($1, $2, $3, $4, $5, $6, 'connected', $7, $8)
     ON CONFLICT (workspace_id, provider, external_account_id)
     DO UPDATE SET
       name = EXCLUDED.name,
       account_name = EXCLUDED.account_name,
       scope = EXCLUDED.scope,
       selected_resources = EXCLUDED.selected_resources,
       status = 'connected'
     RETURNING id, workspace_id, owner_id, provider, external_account_id,
               account_name, name, status, scope, selected_resources,
               sync_interval_min, last_sync_at, next_sync_at,
               created_at, updated_at`,
    [
      workspaceId,
      userId,
      provider,
      externalAccountId,
      name,
      name,
      scope,
      JSON.stringify(Array.isArray(selectedResources) ? selectedResources : []),
    ],
  );
  return mapConnection(rows[0]);
}

export async function getConnection(
  userId: string,
  workspaceId: string,
  connectionId: string,
): Promise<ConnectionRecord | null> {
  const rows = await queryTenant<ConnectionRow>(
    userId,
    `SELECT id, workspace_id, owner_id, provider, external_account_id,
            account_name, name, status, scope, selected_resources,
            sync_interval_min, last_sync_at, next_sync_at,
            created_at, updated_at
       FROM connections
      WHERE id = $1 AND workspace_id = $2
      LIMIT 1`,
    [connectionId, workspaceId],
  );
  return rows[0] ? mapConnection(rows[0]) : null;
}

export async function listConnections(
  userId: string,
  workspaceId: string,
): Promise<ConnectionRecord[]> {
  const rows = await queryTenant<ConnectionRow>(
    userId,
    `SELECT id, workspace_id, owner_id, provider, external_account_id,
            account_name, name, status, scope, selected_resources,
            sync_interval_min, last_sync_at, next_sync_at,
            created_at, updated_at
       FROM connections
      WHERE workspace_id = $1
      ORDER BY created_at DESC`,
    [workspaceId],
  );
  return rows.map(mapConnection);
}

export async function updateConnectionStatus(
  userId: string,
  workspaceId: string,
  connectionId: string,
  status: ConnectionStatus,
): Promise<void> {
  await queryTenant(
    userId,
    `UPDATE connections SET status = $3 WHERE id = $1 AND workspace_id = $2`,
    [connectionId, workspaceId, status],
  );
}

export async function updateConnectionDetails(
  userId: string,
  workspaceId: string,
  connectionId: string,
  patch: { name?: string; selectedResources?: unknown[]; syncIntervalMin?: number },
): Promise<ConnectionRecord> {
  const sets: string[] = [];
  const params: unknown[] = [];
  let idx = 1;
  if (patch.name !== undefined) {
    sets.push(`name = $${idx++}`);
    params.push(patch.name);
  }
  if (patch.selectedResources !== undefined) {
    sets.push(`selected_resources = $${idx++}`);
    params.push(JSON.stringify(patch.selectedResources));
  }
  if (patch.syncIntervalMin !== undefined) {
    sets.push(`sync_interval_min = $${idx++}`);
    params.push(patch.syncIntervalMin);
  }
  if (sets.length === 0) {
    const existing = await getConnection(userId, workspaceId, connectionId);
    if (!existing) throw new Error("CONNECTION_NOT_FOUND");
    return existing;
  }
  params.push(connectionId, workspaceId);
  const rows = await queryTenant<ConnectionRow>(
    userId,
    `UPDATE connections SET ${sets.join(", ")}
        WHERE id = $${idx} AND workspace_id = $${idx + 1}
      RETURNING id, workspace_id, owner_id, provider, external_account_id,
                account_name, name, status, scope, selected_resources,
                sync_interval_min, last_sync_at, next_sync_at,
                created_at, updated_at`,
    params,
  );
  if (!rows[0]) throw new Error("CONNECTION_NOT_FOUND");
  return mapConnection(rows[0]);
}

export async function setTokens(
  userId: string,
  connectionId: string,
  token: ConnectorToken,
): Promise<void> {
  const accessEnc = encryptSecret(token.accessToken);
  const refreshEnc = token.refreshToken
    ? encryptSecret(token.refreshToken)
    : null;
  const expiresAt = token.expiresAt
    ? new Date(token.expiresAt).toISOString()
    : null;
  await queryTenant(
    userId,
    `WITH del AS (
       DELETE FROM connection_tokens WHERE connection_id = $1
     )
     INSERT INTO connection_tokens
       (connection_id, access_token_enc, refresh_token_enc, expires_at, scope, token_type)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [connectionId, accessEnc, refreshEnc, expiresAt, token.scope ?? [], token.tokenType ?? "bearer"],
  );
}

export async function getTokenRow(
  userId: string,
  workspaceId: string,
  connectionId: string,
): Promise<{ accessTokenEnc: string; refreshTokenEnc: string | null; expiresAt: string | null; scope: string[] } | null> {
  const rows = await queryTenant<TokenRow>(
    userId,
    `SELECT ct.access_token_enc, ct.refresh_token_enc, ct.expires_at, ct.scope
       FROM connection_tokens ct
       JOIN connections c ON c.id = ct.connection_id
      WHERE ct.connection_id = $1 AND c.workspace_id = $2
      LIMIT 1`,
    [connectionId, workspaceId],
  );
  if (!rows[0]) return null;
  return {
    accessTokenEnc: rows[0].access_token_enc,
    refreshTokenEnc: rows[0].refresh_token_enc,
    expiresAt: toIso(rows[0].expires_at),
    scope: rows[0].scope ?? [],
  };
}

export async function disconnectConnection(
  userId: string,
  workspaceId: string,
  connectionId: string,
): Promise<void> {
  await revokeAuthorization(userId, workspaceId, connectionId);
}
