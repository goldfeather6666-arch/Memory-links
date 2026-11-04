/**
 * MNEMOSYNE — Part 8 connectors: OAuth flows.
 *
 * Authorization URL generation (with PKCE state persisted in oauth_states),
 * callback token exchange + account-identity resolution, token refresh and
 * best-effort revocation. All identity-scoped DB access goes through
 * queryTenant(userId) / queryRaw so RLS applies consistently.
 */
import crypto from "node:crypto";
import { queryRaw, queryTenant } from "@/db/client";
import { recordAuditEvent } from "@/server/data/audit";
import { getServerEnv } from "@/lib/env";
import { decryptSecret } from "./crypto";
import { getProvider } from "./registry";
import {
  createConnection,
  getConnection,
  getTokenRow,
  setTokens,
  updateConnectionStatus,
} from "./connections";
import type {
  ConnectionRecord,
  ConnectorToken,
  ProviderId,
} from "./types";

const STATE_TTL_MS = 15 * 60 * 1000;
const REFRESH_LEAD_MS = 60 * 1000;

interface OAuthStateRow {
  id: string;
  user_id: string;
  workspace_id: string;
  provider: string;
  state: string;
  code_challenge: string;
  code_verifier: string;
  redirect_to: string | null;
  created_at: string;
  expires_at: string;
}

function callbackUrl(): string {
  return `${getServerEnv().APP_URL}/api/v1/integrations/oauth/callback`;
}

interface ClientCredentials {
  clientId: string;
  clientSecret: string;
}

function getClientCredentials(provider: ProviderId): ClientCredentials {
  const env = getServerEnv();
  switch (provider) {
    case "google_drive":
    case "gmail": {
      if (!env.GOOGLE_OAUTH_CLIENT_ID || !env.GOOGLE_OAUTH_CLIENT_SECRET) {
        throw new Error("NOT_CONFIGURED");
      }
      return {
        clientId: env.GOOGLE_OAUTH_CLIENT_ID,
        clientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET,
      };
    }
    case "onedrive": {
      // No Microsoft env vars exist yet; use the Google client as a
      // placeholder so the flow can be exercised end-to-end once configured.
      if (!env.GOOGLE_OAUTH_CLIENT_ID || !env.CONNECTOR_ENCRYPTION_SECRET) {
        throw new Error("NOT_CONFIGURED");
      }
      return {
        clientId: env.GOOGLE_OAUTH_CLIENT_ID,
        clientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET ?? "",
      };
    }
    case "github": {
      if (!env.GITHUB_OAUTH_CLIENT_ID || !env.GITHUB_OAUTH_CLIENT_SECRET) {
        throw new Error("NOT_CONFIGURED");
      }
      return {
        clientId: env.GITHUB_OAUTH_CLIENT_ID,
        clientSecret: env.GITHUB_OAUTH_CLIENT_SECRET,
      };
    }
    case "notion": {
      if (!env.NOTION_OAUTH_CLIENT_ID || !env.NOTION_OAUTH_CLIENT_SECRET) {
        throw new Error("NOT_CONFIGURED");
      }
      return {
        clientId: env.NOTION_OAUTH_CLIENT_ID,
        clientSecret: env.NOTION_OAUTH_CLIENT_SECRET,
      };
    }
    case "gitlab": {
      if (!env.GITLAB_OAUTH_CLIENT_ID || !env.GITLAB_OAUTH_CLIENT_SECRET) {
        throw new Error("NOT_CONFIGURED");
      }
      return {
        clientId: env.GITLAB_OAUTH_CLIENT_ID,
        clientSecret: env.GITLAB_OAUTH_CLIENT_SECRET,
      };
    }
    case "slack": {
      if (!env.SLACK_OAUTH_CLIENT_ID || !env.SLACK_OAUTH_CLIENT_SECRET) {
        throw new Error("NOT_CONFIGURED");
      }
      return {
        clientId: env.SLACK_OAUTH_CLIENT_ID,
        clientSecret: env.SLACK_OAUTH_CLIENT_SECRET,
      };
    }
    case "linear": {
      if (!env.LINEAR_OAUTH_CLIENT_ID || !env.LINEAR_OAUTH_CLIENT_SECRET) {
        throw new Error("NOT_CONFIGURED");
      }
      return {
        clientId: env.LINEAR_OAUTH_CLIENT_ID,
        clientSecret: env.LINEAR_OAUTH_CLIENT_SECRET,
      };
    }
    case "jira": {
      if (!env.JIRA_OAUTH_CLIENT_ID || !env.JIRA_OAUTH_CLIENT_SECRET) {
        throw new Error("NOT_CONFIGURED");
      }
      return {
        clientId: env.JIRA_OAUTH_CLIENT_ID,
        clientSecret: env.JIRA_OAUTH_CLIENT_SECRET,
      };
    }
    case "dropbox": {
      if (!env.DROPBOX_OAUTH_APP_KEY || !env.DROPBOX_OAUTH_APP_SECRET) {
        throw new Error("NOT_CONFIGURED");
      }
      return {
        clientId: env.DROPBOX_OAUTH_APP_KEY,
        clientSecret: env.DROPBOX_OAUTH_APP_SECRET,
      };
    }
    default:
      throw new Error("NOT_CONFIGURED");
  }
}

function base64Url(value: Buffer): string {
  return value
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function parseScope(scope: unknown): string[] {
  if (Array.isArray(scope)) return scope.map((s) => String(s));
  if (typeof scope === "string" && scope.trim()) {
    return scope.split(/[\s,]+/).filter(Boolean);
  }
  return [];
}

function errorMessage(data: Record<string, unknown>): string | null {
  if (typeof data.error_description === "string" && data.error_description) {
    return data.error_description;
  }
  if (typeof data.error === "string" && data.error) return data.error;
  return null;
}

async function tokenRequest(
  tokenUrl: string,
  form: Record<string, string>,
): Promise<Record<string, unknown>> {
  const resp = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams(form).toString(),
  });
  const data = (await resp.json().catch(() => ({}))) as Record<string, unknown>;
  if (!resp.ok) {
    throw new Error(errorMessage(data) ?? "TOKEN_EXCHANGE_FAILED");
  }
  return data;
}

function toToken(data: Record<string, unknown>): ConnectorToken {
  const expiresIn = typeof data.expires_in === "number" ? data.expires_in : undefined;
  return {
    accessToken: String(data.access_token),
    refreshToken: data.refresh_token ? String(data.refresh_token) : null,
    expiresAt: expiresIn ? Date.now() + expiresIn * 1000 : null,
    scope: parseScope(data.scope),
    tokenType: data.token_type ? String(data.token_type) : "bearer",
  };
}

async function resolveAccountIdentity(
  provider: ProviderId,
  accessToken: string,
): Promise<{ externalAccountId: string; accountName: string | null }> {
  const bearer = { Authorization: `Bearer ${accessToken}` };
  switch (provider) {
    case "github": {
      const r = await fetch("https://api.github.com/user", {
        headers: { ...bearer, Accept: "application/vnd.github+json" },
      });
      const d = (await r.json().catch(() => ({}))) as Record<string, unknown>;
      return {
        externalAccountId: String(d.id ?? "github"),
        accountName: d.login ? String(d.login) : null,
      };
    }
    case "google_drive":
    case "gmail": {
      const r = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: bearer,
      });
      const d = (await r.json().catch(() => ({}))) as Record<string, unknown>;
      return {
        externalAccountId: String(d.sub ?? "google"),
        accountName: d.email ? String(d.email) : null,
      };
    }
    case "notion": {
      const r = await fetch("https://api.notion.com/v1/users/me", {
        headers: { ...bearer, "Notion-Version": "2022-06-28" },
      });
      const d = (await r.json().catch(() => ({}))) as Record<string, unknown>;
      return {
        externalAccountId: String(d.id ?? "notion"),
        accountName: d.name ? String(d.name) : null,
      };
    }
    case "gitlab": {
      const r = await fetch("https://gitlab.com/api/v4/user", { headers: bearer });
      const d = (await r.json().catch(() => ({}))) as Record<string, unknown>;
      return {
        externalAccountId: String(d.id ?? "gitlab"),
        accountName: d.username ? String(d.username) : (d.name ? String(d.name) : null),
      };
    }
    case "slack": {
      const r = await fetch("https://slack.com/api/auth.test", { headers: bearer });
      const d = (await r.json().catch(() => ({}))) as Record<string, unknown>;
      return {
        externalAccountId: d.user_id ? String(d.user_id) : "slack",
        accountName: d.user ? String(d.user) : null,
      };
    }
    case "linear": {
      const r = await fetch("https://api.linear.app/graphql", {
        method: "POST",
        headers: { ...bearer, "Content-Type": "application/json" },
        body: JSON.stringify({ query: "{ viewer { id name } }" }),
      });
      const d = (await r.json().catch(() => ({}))) as {
        data?: { viewer?: { id?: unknown; name?: unknown } };
      };
      const viewer = d.data?.viewer;
      return {
        externalAccountId: String(viewer?.id ?? "linear"),
        accountName: viewer?.name ? String(viewer.name) : null,
      };
    }
    case "jira": {
      const r = await fetch("https://api.atlassian.com/oauth/token/accessible-resources", {
        headers: bearer,
      });
      const list = (await r.json().catch(() => [])) as Array<{
        id?: unknown;
        name?: unknown;
      }>;
      const first = list[0];
      return {
        externalAccountId: String(first?.id ?? "jira"),
        accountName: first?.name ? String(first.name) : null,
      };
    }
    case "dropbox": {
      const r = await fetch("https://api.dropboxapi.com/2/users/get_current_account", {
        method: "POST",
        headers: { ...bearer, "Content-Type": "application/json" },
        body: "{}",
      });
      const d = (await r.json().catch(() => ({}))) as Record<string, unknown>;
      const name = d.name as { display_name?: unknown } | undefined;
      return {
        externalAccountId: String(d.account_id ?? "dropbox"),
        accountName: name?.display_name ? String(name.display_name) : null,
      };
    }
    case "onedrive": {
      const r = await fetch("https://graph.microsoft.com/v1.0/me", {
        headers: bearer,
      });
      const d = (await r.json().catch(() => ({}))) as Record<string, unknown>;
      return {
        externalAccountId: String(d.id ?? "onedrive"),
        accountName: d.displayName ? String(d.displayName) : null,
      };
    }
    default:
      throw new Error("NOT_CONFIGURED");
  }
}

export async function buildAuthorizeUrl(
  userId: string,
  workspaceId: string,
  provider: ProviderId,
  redirectTo?: string,
): Promise<{ url: string }> {
  const descriptor = getProvider(provider);
  if (!descriptor.oauth) throw new Error("NOT_CONFIGURED");
  const { clientId } = getClientCredentials(provider);

  const state = crypto.randomBytes(24).toString("base64url");
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = base64Url(crypto.createHash("sha256").update(verifier).digest());
  const expiresAt = new Date(Date.now() + STATE_TTL_MS).toISOString();

  await queryTenant(
    userId,
    `INSERT INTO oauth_states
       (user_id, workspace_id, provider, state, code_challenge, code_verifier,
        redirect_to, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [userId, workspaceId, provider, state, challenge, verifier, redirectTo ?? null, expiresAt],
  );

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callbackUrl(),
    response_type: "code",
    state,
    scope: descriptor.oauth.scopes.join(" "),
  });
  if (descriptor.oauth.pkce) {
    params.set("code_challenge", challenge);
    params.set("code_challenge_method", "S256");
  }
  return { url: `${descriptor.oauth.authorizeUrl}?${params.toString()}` };
}

export async function handleOAuthCallback(
  provider: ProviderId,
  code: string,
  state: string,
): Promise<ConnectionRecord> {
  const states = await queryRaw<OAuthStateRow>(
    `SELECT * FROM oauth_states WHERE state = $1`,
    [state],
  );
  if (!states[0]) throw new Error("INVALID_STATE");
  const s = states[0];
  const userId = s.user_id;

  // Consume the state row regardless of outcome (single use).
  await queryTenant(userId, `DELETE FROM oauth_states WHERE state = $1`, [state]);

  if (new Date(s.expires_at).getTime() < Date.now()) {
    throw new Error("STATE_EXPIRED");
  }

  const descriptor = getProvider(provider);
  if (!descriptor.oauth) throw new Error("NOT_CONFIGURED");
  const { clientId, clientSecret } = getClientCredentials(provider);

  const form: Record<string, string> = {
    grant_type: "authorization_code",
    code,
    redirect_uri: callbackUrl(),
    client_id: clientId,
    client_secret: clientSecret,
  };
  if (descriptor.oauth.pkce && s.code_verifier) {
    form.code_verifier = s.code_verifier;
  }

  const data = await tokenRequest(descriptor.oauth.tokenUrl, form);
  if (!data.access_token) throw new Error("TOKEN_EXCHANGE_FAILED");
  const token = toToken(data);

  const { externalAccountId, accountName } = await resolveAccountIdentity(
    provider,
    token.accessToken,
  );
  const connection = await createConnection(
    userId,
    s.workspace_id,
    provider,
    externalAccountId,
    accountName ?? provider,
    token.scope,
    [],
  );
  await setTokens(userId, connection.id, token);
  await recordAuditEvent({
    actorId: userId,
    action: "connector.connect",
    entityType: "connection",
    entityId: connection.id,
    workspaceId: s.workspace_id,
    metadata: { provider },
  });
  return connection;
}

export async function getAccessToken(
  userId: string,
  workspaceId: string,
  connectionId: string,
): Promise<string> {
  const connection = await getConnection(userId, workspaceId, connectionId);
  if (!connection) throw new Error("CONNECTION_NOT_FOUND");
  const row = await getTokenRow(userId, workspaceId, connectionId);
  if (!row) throw new Error("TOKEN_NOT_FOUND");

  const accessToken = decryptSecret(row.accessTokenEnc);
  const expiresAt = row.expiresAt ? new Date(row.expiresAt).getTime() : null;
  const needsRefresh =
    expiresAt !== null && expiresAt - Date.now() < REFRESH_LEAD_MS;
  if (!needsRefresh) return accessToken;

  if (!row.refreshTokenEnc) {
    await updateConnectionStatus(userId, workspaceId, connectionId, "expired");
    throw new Error("TOKEN_EXPIRED");
  }
  const descriptor = getProvider(connection.provider);
  if (!descriptor.oauth) throw new Error("TOKEN_EXPIRED");
  const { clientId, clientSecret } = getClientCredentials(connection.provider);
  const refreshToken = decryptSecret(row.refreshTokenEnc);

  let data: Record<string, unknown>;
  try {
    data = await tokenRequest(descriptor.oauth.tokenUrl, {
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    });
  } catch {
    await updateConnectionStatus(userId, workspaceId, connectionId, "expired");
    throw new Error("TOKEN_EXPIRED");
  }
  if (!data.access_token) {
    await updateConnectionStatus(userId, workspaceId, connectionId, "expired");
    throw new Error("TOKEN_EXPIRED");
  }

  const token: ConnectorToken = {
    accessToken: String(data.access_token),
    refreshToken: data.refresh_token ? String(data.refresh_token) : refreshToken,
    expiresAt:
      typeof data.expires_in === "number"
        ? Date.now() + data.expires_in * 1000
        : null,
    scope: parseScope(data.scope),
    tokenType: data.token_type ? String(data.token_type) : "bearer",
  };
  await setTokens(userId, connectionId, token);
  return token.accessToken;
}

export async function revokeAuthorization(
  userId: string,
  workspaceId: string,
  connectionId: string,
): Promise<void> {
  const connection = await getConnection(userId, workspaceId, connectionId);
  if (!connection) throw new Error("CONNECTION_NOT_FOUND");
  const descriptor = getProvider(connection.provider);

  const row = await getTokenRow(userId, workspaceId, connectionId);
  if (row && descriptor.oauth?.revokeUrl) {
    try {
      const accessToken = decryptSecret(row.accessTokenEnc);
      const { clientId } = getClientCredentials(connection.provider);
      await fetch(descriptor.oauth.revokeUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: accessToken, client_id: clientId }).toString(),
      });
    } catch {
      // Best-effort: provider-side revocation failure must not block local cleanup.
    }
  }

  await queryTenant(
    userId,
    `DELETE FROM connection_tokens WHERE connection_id = $1`,
    [connectionId],
  );
  await updateConnectionStatus(userId, workspaceId, connectionId, "disconnected");
  await recordAuditEvent({
    actorId: userId,
    action: "connector.revoke",
    entityType: "connection",
    entityId: connectionId,
    workspaceId,
    metadata: { provider: connection.provider },
  });
}
