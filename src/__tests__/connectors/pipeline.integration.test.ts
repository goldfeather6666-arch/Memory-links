import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("connector pipeline integration", () => {
  async function setup() {
    const { queryTenant } = await import("@/db/client");
    const { createWorkspace } = await import("@/server/data/workspaces");
    const { createConnection } = await import("@/server/connectors/connections");
    const emailA = `conn-a-${randomUUID()}@test.local`;
    const emailB = `conn-b-${randomUUID()}@test.local`;
    const [a] = await queryTenant(null, `INSERT INTO users (email, password_hash) VALUES ($1, 'x') RETURNING id`, [emailA]);
    const [b] = await queryTenant(null, `INSERT INTO users (email, password_hash) VALUES ($1, 'x') RETURNING id`, [emailB]);
    const ws = await createWorkspace(a.id, `Conn Ws ${randomUUID()}`, null, null);
    const connection = await createConnection(a.id, ws.id, "github", "acme/repo", "acme/repo", ["repo"], []);
    return { queryTenant, a, b, ws, connection };
  }

  function source(connection: { id: string; workspaceId: string }, externalId: string, content: string, modifiedAt = "2026-01-01T00:00:00.000Z") {
    return {
      provider: "github" as const,
      connectionId: connection.id,
      workspaceId: connection.workspaceId,
      externalId,
      recordType: "issue",
      title: "Title",
      content,
      author: "octo",
      timestamp: "2026-01-01T00:00:00.000Z",
      modifiedAt,
      url: null,
      parentId: null,
      threadId: null,
      fileMeta: null as Record<string, unknown> | null,
      metadata: {} as Record<string, unknown>,
    };
  }

  it("imports a new source and records provenance", async () => {
    const { queryTenant, a, ws, connection } = await setup();
    const { processSource } = await import("@/server/connectors/pipeline");

    const outcome = await processSource(a.id, connection, source(connection, "issue-1", "Login redirect fails"));
    expect(outcome.action).toBe("imported");
    expect(outcome.ingestionId).toBeTruthy();

    const [row] = await queryTenant(
      a.id,
      `SELECT content_hash AS "contentHash", record_type AS "recordType", status, owner_id AS "ownerId" FROM connection_sources WHERE connection_id = $1 AND external_id = $2`,
      [connection.id, "issue-1"],
    );
    expect(row).toBeTruthy();
    expect(row.recordType).toBe("issue");
    expect(row.status).toBe("active");
    expect(row.ownerId).toBe(a.id);
    await queryTenant(null, `DELETE FROM users WHERE id IN ($1,$2)`, [a.id, ws.ownerId]);
  });

  it("recognizes duplicates by content hash", async () => {
    const { queryTenant, a, ws, connection } = await setup();
    const { processSource } = await import("@/server/connectors/pipeline");

    const s = source(connection, "issue-1", "Same content");
    const first = await processSource(a.id, connection, s);
    expect(first.action).toBe("imported");
    const second = await processSource(a.id, connection, s);
    expect(second.action).toBe("duplicate");
    await queryTenant(null, `DELETE FROM users WHERE id IN ($1,$2)`, [a.id, ws.ownerId]);
  });

  it("reprocesses a changed source and updates the hash", async () => {
    const { queryTenant, a, ws, connection } = await setup();
    const { processSource } = await import("@/server/connectors/pipeline");

    await processSource(a.id, connection, source(connection, "issue-1", "v1"));
    const updated = await processSource(a.id, connection, source(connection, "issue-1", "v2", "2026-02-01T00:00:00.000Z"));
    expect(updated.action).toBe("imported");

    const [row] = await queryTenant(a.id, `SELECT content_hash AS "contentHash" FROM connection_sources WHERE connection_id = $1 AND external_id = $2`, [connection.id, "issue-1"]);
    const { computeContentHash } = await import("@/server/connectors/normalize");
    expect(row.contentHash).toBe(computeContentHash(source(connection, "issue-1", "v2", "2026-02-01T00:00:00.000Z")));
    await queryTenant(null, `DELETE FROM users WHERE id IN ($1,$2)`, [a.id, ws.ownerId]);
  });

  it("skips sources with no content", async () => {
    const { queryTenant, a, ws, connection } = await setup();
    const { processSource } = await import("@/server/connectors/pipeline");
    const outcome = await processSource(a.id, connection, source(connection, "issue-empty", "   "));
    expect(outcome.action).toBe("skipped");
    await queryTenant(null, `DELETE FROM users WHERE id IN ($1,$2)`, [a.id, ws.ownerId]);
  });

  it("blocks cross-workspace sources", async () => {
    const { queryTenant, a, b, ws, connection } = await setup();
    const { processSource } = await import("@/server/connectors/pipeline");
    const foreign = { ...source(connection, "issue-x", "content"), workspaceId: "other-workspace" };
    const outcome = await processSource(a.id, connection, foreign);
    expect(outcome.action).toBe("failed");
    expect(outcome.error).toBe("WORKSPACE_MISMATCH");
    await queryTenant(null, `DELETE FROM users WHERE id IN ($1,$2,$3)`, [a.id, b.id, ws.ownerId]);
  });

  it("fails when caller lacks workspace access", async () => {
    const { queryTenant, a, b, ws, connection } = await setup();
    const { processSource } = await import("@/server/connectors/pipeline");
    const outcome = await processSource(b.id, connection, source(connection, "issue-y", "content"));
    expect(outcome.action).toBe("failed");
    await queryTenant(null, `DELETE FROM users WHERE id IN ($1,$2,$3)`, [a.id, b.id, ws.ownerId]);
  });
});
