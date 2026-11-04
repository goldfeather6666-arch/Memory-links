import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("connector connections integration", () => {
  async function setup(ownerEmail: string) {
    const { queryTenant } = await import("@/db/client");
    const { createWorkspace } = await import("@/server/data/workspaces");
    const [owner] = await queryTenant(null, `INSERT INTO users (email, password_hash) VALUES ($1, 'x') RETURNING id`, [ownerEmail]);
    const ws = await createWorkspace(owner.id, `Conn Ws ${randomUUID()}`, null, null);
    return { queryTenant, owner, ws };
  }

  it("stores encrypted tokens and never plaintext", async () => {
    const { queryTenant, owner, ws } = await setup(`tok-a-${randomUUID()}@test.local`);
    const { createConnection, getTokenRow } = await import("@/server/connectors/connections");
    const conn = await createConnection(owner.id, ws.id, "github", "acme/repo", "acme/repo", ["repo"], []);
    const plain = "gho_plaintext_secret";
    const { setTokens } = await import("@/server/connectors/connections");
    await setTokens(owner.id, conn.id, { accessToken: plain, refreshToken: "refresh-secret", expiresAt: Date.now() + 3600_000, scope: ["repo"], tokenType: "bearer" });
    const row = await getTokenRow(owner.id, ws.id, conn.id);
    expect(row).toBeTruthy();
    expect(row!.accessTokenEnc).not.toContain(plain);
    expect(row!.refreshTokenEnc).not.toContain("refresh-secret");
    // encrypted payloads use v1 framing
    expect(row!.accessTokenEnc.startsWith("v1:")).toBe(true);
    await queryTenant(null, `DELETE FROM users WHERE id = $1`, [owner.id]);
  });

  it("does not leak connections across workspaces/users", async () => {
    const { queryTenant, owner, ws } = await setup(`iso-a-${randomUUID()}@test.local`);
    const [other] = await queryTenant(null, `INSERT INTO users (email, password_hash) VALUES ($1, 'x') RETURNING id`, [`iso-b-${randomUUID()}@test.local`]);
    const { createConnection, getConnection } = await import("@/server/connectors/connections");
    const conn = await createConnection(owner.id, ws.id, "github", "acme/repo", "acme/repo", ["repo"], []);
    expect(await getConnection(owner.id, ws.id, conn.id)).toBeTruthy();
    expect(await getConnection(other.id, ws.id, conn.id)).toBeNull();
    await queryTenant(null, `DELETE FROM users WHERE id IN ($1,$2)`, [owner.id, other.id]);
  });

  it("status transitions are persisted", async () => {
    const { queryTenant, owner, ws } = await setup(`stat-a-${randomUUID()}@test.local`);
    const { createConnection, getConnection, updateConnectionStatus } = await import("@/server/connectors/connections");
    const conn = await createConnection(owner.id, ws.id, "github", "acme/repo", "acme/repo", ["repo"], []);
    await updateConnectionStatus(owner.id, ws.id, conn.id, "paused");
    const after = await getConnection(owner.id, ws.id, conn.id);
    expect(after?.status).toBe("paused");
    await queryTenant(null, `DELETE FROM users WHERE id = $1`, [owner.id]);
  });

  it("re-creating the same account updates rather than duplicates", async () => {
    const { queryTenant, owner, ws } = await setup(`dedup-a-${randomUUID()}@test.local`);
    const { createConnection, listConnections } = await import("@/server/connectors/connections");
    await createConnection(owner.id, ws.id, "github", "acme/repo", "name1", ["repo"], []);
    await createConnection(owner.id, ws.id, "github", "acme/repo", "name2", ["repo"], []);
    const list = await listConnections(owner.id, ws.id);
    const github = list.filter((c) => c.provider === "github" && c.externalAccountId === "acme/repo");
    expect(github).toHaveLength(1);
    expect(github[0].name).toBe("name2");
    await queryTenant(null, `DELETE FROM users WHERE id = $1`, [owner.id]);
  });
});
