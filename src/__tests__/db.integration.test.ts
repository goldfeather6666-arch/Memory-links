import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";

// Gated on DATABASE_URL — skipped in CI/preview where the DB is not available.
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("database integration", () => {
  it("isolates user data (user B cannot see user A's workspace)", async () => {
    const { queryTenant } = await import("@/db/client");
    const {
      createWorkspace,
      listWorkspacesForUser,
      userHasWorkspaceAccess,
    } = await import("@/server/data/workspaces");

    const emailA = `it-a-${randomUUID()}@test.local`;
    const emailB = `it-b-${randomUUID()}@test.local`;

    const insert = `INSERT INTO users (email, password_hash) VALUES ($1, 'x') RETURNING id`;
    const [a] = await queryTenant(null, insert, [emailA]);
    const [b] = await queryTenant(null, insert, [emailB]);

    const ws = await createWorkspace(a.id, "A's Workspace", null, null);

    // A sees their workspace.
    const forA = await listWorkspacesForUser(a.id);
    expect(forA.some((w) => w.workspace.id === ws.id)).toBe(true);

    // B cannot see it.
    const forB = await listWorkspacesForUser(b.id);
    expect(forB.some((w) => w.workspace.id === ws.id)).toBe(false);
    expect(await userHasWorkspaceAccess(b.id, ws.id)).toBe(false);

    // cleanup
    await queryTenant(null, `DELETE FROM users WHERE id = ANY($1)`, [[a.id, b.id]]);
  });
});
