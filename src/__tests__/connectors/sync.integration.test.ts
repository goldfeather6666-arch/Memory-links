import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("connector sync integration", () => {
  async function setup() {
    const { queryTenant } = await import("@/db/client");
    const { createWorkspace } = await import("@/server/data/workspaces");
    const emailA = `sync-a-${randomUUID()}@test.local`;
    const emailB = `sync-b-${randomUUID()}@test.local`;
    const [a] = await queryTenant(null, `INSERT INTO users (email, password_hash) VALUES ($1, 'x') RETURNING id`, [emailA]);
    const [b] = await queryTenant(null, `INSERT INTO users (email, password_hash) VALUES ($1, 'x') RETURNING id`, [emailB]);
    const ws = await createWorkspace(a.id, `Sync Ws ${randomUUID()}`, null, null);
    return { queryTenant, a, b, ws };
  }

  it("runSync rejects users without workspace access", async () => {
    const { queryTenant, a, b, ws } = await setup();
    const { createConnection } = await import("@/server/connectors/connections");
    const conn = await createConnection(a.id, ws.id, "rss", "feed-1", "feed", [], []);
    const { runSync } = await import("@/server/connectors/sync");
    await expect(runSync(b.id, ws.id, conn.id, "manual")).rejects.toThrow("FORBIDDEN");
    await queryTenant(null, `DELETE FROM users WHERE id IN ($1,$2)`, [a.id, b.id]);
  });

  it("runSync rejects an unknown connection", async () => {
    const { queryTenant, a, ws } = await setup();
    const { runSync } = await import("@/server/connectors/sync");
    await expect(runSync(a.id, ws.id, randomUUID(), "manual")).rejects.toThrow("CONNECTION_NOT_FOUND");
    await queryTenant(null, `DELETE FROM users WHERE id = $1`, [a.id]);
  });

  it("runSync refuses paused connections", async () => {
    const { queryTenant, a, ws } = await setup();
    const { createConnection, updateConnectionStatus } = await import("@/server/connectors/connections");
    const conn = await createConnection(a.id, ws.id, "rss", "feed-1", "feed", [], []);
    await updateConnectionStatus(a.id, ws.id, conn.id, "paused");
    const { runSync } = await import("@/server/connectors/sync");
    const result = await runSync(a.id, ws.id, conn.id, "manual");
    expect(result.error).toBe("PAUSED");
    await queryTenant(null, `DELETE FROM users WHERE id = $1`, [a.id]);
  });

  it("shouldRunScheduled respects interval and next_run_at", async () => {
    const { shouldRunScheduled } = await import("@/server/connectors/sync");
    const base = {
      id: "1",
      workspaceId: "w",
      ownerId: "o",
      provider: "rss" as const,
      externalAccountId: "e",
      accountName: null,
      name: "n",
      status: "connected" as const,
      scope: [],
      selectedResources: [],
      syncIntervalMin: 30,
      lastSyncAt: null,
      nextSyncAt: null,
      createdAt: "",
      updatedAt: "",
    };
    const now = new Date("2026-01-01T00:00:00Z");
    expect(shouldRunScheduled(base, now)).toBe(true);
    expect(shouldRunScheduled({ ...base, syncIntervalMin: null }, now)).toBe(false);
    expect(
      shouldRunScheduled(
        { ...base, nextSyncAt: "2026-01-02T00:00:00Z" },
        now,
      ),
    ).toBe(false);
    expect(
      shouldRunScheduled(
        { ...base, nextSyncAt: "2025-12-31T00:00:00Z" },
        now,
      ),
    ).toBe(true);
  });
});
