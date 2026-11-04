import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

// GitHub OAuth client credentials required by getClientCredentials("github").
process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgres://user:pass@localhost:5432/test";
process.env.GITHUB_OAUTH_CLIENT_ID = "test-client-id";
process.env.GITHUB_OAUTH_CLIENT_SECRET = "test-client-secret";
process.env.CONNECTOR_ENCRYPTION_SECRET = "test-connector-secret";
process.env.APP_URL = "http://localhost:3000";

const hasDb = Boolean(process.env.DATABASE_URL);

const TOKEN_URL = "https://github.com/login/oauth/access_token";
const USERINFO_URL = "https://api.github.com/user";

function respond(body: unknown): Response {
  // Minimal Response-like object consumed by fetchJson / tokenRequest.
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as unknown as Response;
}

describe.skipIf(!hasDb)("connector oauth integration", () => {
  let state: string | null = null;

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function setup() {
    const { queryTenant } = await import("@/db/client");
    const { createWorkspace } = await import("@/server/data/workspaces");
    const email = `oauth-a-${randomUUID()}@test.local`;
    const [owner] = await queryTenant(
      null,
      `INSERT INTO users (email, password_hash) VALUES ($1, 'x') RETURNING id`,
      [email],
    );
    const ws = await createWorkspace(owner.id, `OAuth Ws ${randomUUID()}`, null, null);
    return { queryTenant, owner, ws };
  }

  async function seedState(userId: string, workspaceId: string) {
    state = randomUUID();
    const { queryTenant } = await import("@/db/client");
    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
    await queryTenant(
      userId,
      `INSERT INTO oauth_states
         (user_id, workspace_id, provider, state, code_challenge, code_verifier, redirect_to, expires_at)
       VALUES ($1, $2, 'github', $3, 'challenge', 'verifier', NULL, $4)`,
      [userId, workspaceId, state, expiresAt],
    );
  }

  it("handleOAuthCallback exchanges code and stores an encrypted-token connection", async () => {
    const { queryTenant, owner, ws } = await setup();
    await seedState(owner.id, ws.id);

    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === TOKEN_URL) {
        return respond({ access_token: "at-1", refresh_token: "rt-1", expires_in: 3600, scope: "repo", token_type: "bearer" });
      }
      if (String(input) === USERINFO_URL) {
        return respond({ id: 987654, login: "octo" });
      }
      return respond({});
    }));

    const { handleOAuthCallback } = await import("@/server/connectors/oauth");
    const connection = await handleOAuthCallback("github", "code-1", state!);
    expect(connection.provider).toBe("github");
    expect(connection.externalAccountId).toBe("987654");
    expect(connection.accountName).toBe("octo");
    expect(connection.status).toBe("connected");

    const { getTokenRow } = await import("@/server/connectors/connections");
    const row = await getTokenRow(owner.id, ws.id, connection.id);
    expect(row).toBeTruthy();
    expect(row!.accessTokenEnc).not.toContain("at-1");
    expect(row!.accessTokenEnc.startsWith("v1:")).toBe(true);

    await queryTenant(null, `DELETE FROM users WHERE id = $1`, [owner.id]);
    state = null;
  });

  it("buildAuthorizeUrl issues a PKCE state and redirect URL", async () => {
    const { queryTenant, owner, ws } = await setup();
    const { buildAuthorizeUrl } = await import("@/server/connectors/oauth");
    const { url } = await buildAuthorizeUrl(owner.id, ws.id, "github");
    expect(url).toContain("https://github.com/login/oauth/authorize");
    expect(url).toContain("client_id=test-client-id");
    expect(url).toContain("code_challenge_method=S256");

    // The state row was persisted and is single-use.
    const [rows] = await queryTenant(
      owner.id,
      `SELECT count(*)::int AS "count" FROM oauth_states WHERE user_id = $1`,
      [owner.id],
    );
    expect(rows.count).toBeGreaterThan(0);
    await queryTenant(null, `DELETE FROM users WHERE id = $1`, [owner.id]);
  });

  it("getAccessToken refreshes an expired token and marks connection connected", async () => {
    const { queryTenant, owner, ws } = await setup();
    const { createConnection, setTokens } = await import("@/server/connectors/connections");
    const conn = await createConnection(owner.id, ws.id, "github", "acme/repo", "acme/repo", ["repo"], []);
    const past = Date.now() - 120_000;
    await setTokens(owner.id, conn.id, {
      accessToken: "old-access",
      refreshToken: "old-refresh",
      expiresAt: past,
      scope: ["repo"],
      tokenType: "bearer",
    });

    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === TOKEN_URL) {
        return respond({ access_token: "new-access", refresh_token: "new-refresh", expires_in: 3600, scope: "repo", token_type: "bearer" });
      }
      return respond({});
    }));

    const { getAccessToken } = await import("@/server/connectors/oauth");
    const token = await getAccessToken(owner.id, ws.id, conn.id);
    expect(token).toBe("new-access");

    const { getTokenRow } = await import("@/server/connectors/connections");
    const row = await getTokenRow(owner.id, ws.id, conn.id);
    expect(row!.accessTokenEnc).not.toContain("new-access");
    await queryTenant(null, `DELETE FROM users WHERE id = $1`, [owner.id]);
  });

  it("revokeAuthorization clears tokens and marks the connection disconnected", async () => {
    const { queryTenant, owner, ws } = await setup();
    const { createConnection, setTokens, getConnection } = await import("@/server/connectors/connections");
    const conn = await createConnection(owner.id, ws.id, "github", "acme/repo", "acme/repo", ["repo"], []);
    await setTokens(owner.id, conn.id, { accessToken: "at", refreshToken: "rt", expiresAt: Date.now() + 3600_000, scope: ["repo"], tokenType: "bearer" });

    const { revokeAuthorization } = await import("@/server/connectors/oauth");
    await revokeAuthorization(owner.id, ws.id, conn.id);

    const { getTokenRow } = await import("@/server/connectors/connections");
    expect(await getTokenRow(owner.id, ws.id, conn.id)).toBeNull();
    const after = await getConnection(owner.id, ws.id, conn.id);
    expect(after?.status).toBe("disconnected");
    await queryTenant(null, `DELETE FROM users WHERE id = $1`, [owner.id]);
  });
});
