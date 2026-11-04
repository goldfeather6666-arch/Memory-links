import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { ExtractedFact } from "@/server/memory/types";

// Gated on DATABASE_URL — skipped where the Postgres DB is not available.
const hasDb = Boolean(process.env.DATABASE_URL);

const fact = (content: string): ExtractedFact => ({
  memoryType: "semantic",
  content,
  summary: content,
  confidence: 0.9,
  validFrom: null,
  validUntil: null,
  entities: [],
});

describe.skipIf(!hasDb)("memory engine integration", () => {
  async function setup() {
    const { queryTenant } = await import("@/db/client");
    const { createWorkspace } = await import("@/server/data/workspaces");
    const emailA = `mem-a-${randomUUID()}@test.local`;
    const emailB = `mem-b-${randomUUID()}@test.local`;
    const [a] = await queryTenant(null, `INSERT INTO users (email, password_hash) VALUES ($1, 'x') RETURNING id`, [emailA]);
    const [b] = await queryTenant(null, `INSERT INTO users (email, password_hash) VALUES ($1, 'x') RETURNING id`, [emailB]);
    const ws = await createWorkspace(a.id, `Mem Ws ${randomUUID()}`, null, null);
    return { queryTenant, a, b, ws };
  }

  it("isolates memories between workspaces (user B cannot read A's memory)", async () => {
    const { queryTenant, a, b, ws } = await setup();
    const { insertMemoryFromFact, getMemory, listMemories } = await import("@/server/memory/storage");

    const view = await insertMemoryFromFact(a.id, ws.id, fact("only A can see this"), {});

    // B cannot read it directly.
    expect(await getMemory(b.id, view.id)).toBeNull();
    // B cannot list it.
    const { items } = await listMemories(b.id, ws.id);
    expect(items.some((m) => m.id === view.id)).toBe(false);

    await queryTenant(null, `DELETE FROM users WHERE id = ANY($1)`, [[a.id, b.id]]);
  });

  it("prevents cross-workspace ingestion", async () => {
    const { queryTenant, a, b, ws } = await setup();
    const { createIngestion } = await import("@/server/memory/ingestion");

    await expect(
      createIngestion(b.id, { workspaceId: ws.id, sourceType: "text", content: "A" }),
    ).rejects.toThrow("FORBIDDEN");

    await queryTenant(null, `DELETE FROM users WHERE id = ANY($1)`, [[a.id, b.id]]);
  });

  it("ingestion is idempotent for the same source+checksum", async () => {
    const { queryTenant, a, b, ws } = await setup();
    const { createIngestion } = await import("@/server/memory/ingestion");

    const input = { workspaceId: ws.id, sourceType: "note" as const, content: "same content", title: "t" };
    const one = await createIngestion(a.id, input);
    const two = await createIngestion(a.id, input);
    expect(two.id).toBe(one.id);

    await queryTenant(null, `DELETE FROM users WHERE id = ANY($1)`, [[a.id, b.id]]);
  });

  it("tracks version history and never silently overwrites", async () => {
    const { queryTenant, a, b, ws } = await setup();
    const { insertMemoryFromFact, updateMemory, getMemoryVersions } = await import("@/server/memory/storage");

    const view = await insertMemoryFromFact(a.id, ws.id, fact("original fact"), {});
    await updateMemory(a.id, view.id, { content: "revised fact", changeReason: "dedup_update" });

    const current = await import("@/server/memory/storage").then((m) => m.getMemory(a.id, view.id));
    expect(current?.content).toBe("revised fact");
    expect(current?.version).toBe(2);

    const versions = await getMemoryVersions(a.id, view.id);
    expect(versions).toHaveLength(2);
    expect(versions.some((v) => v.content === "original fact")).toBe(true);

    await queryTenant(null, `DELETE FROM users WHERE id = ANY($1)`, [[a.id, b.id]]);
  });

  it("detects duplicates via exact and normalized text match", async () => {
    const { queryTenant, a, b, ws } = await setup();
    const { insertMemoryFromFact } = await import("@/server/memory/storage");
    const { findDuplicate } = await import("@/server/memory/duplication");

    await insertMemoryFromFact(a.id, ws.id, fact("The project uses PostgreSQL."), {});

    const exact = await findDuplicate(a.id, ws.id, fact("The project uses PostgreSQL."));
    expect(["duplicate", "update"]).toContain(exact.outcome);

    const normalized = await findDuplicate(a.id, ws.id, fact("the project uses postgres"));
    expect(["duplicate", "update"]).toContain(normalized.outcome);

    const brandNew = await findDuplicate(a.id, ws.id, fact("A completely unrelated memory about coffee."));
    expect(brandNew.outcome).toBe("new");

    await queryTenant(null, `DELETE FROM users WHERE id = ANY($1)`, [[a.id, b.id]]);
  });

  it("archive and delete transitions preserve the record for explicit flows", async () => {
    const { queryTenant, a, b, ws } = await setup();
    const { insertMemoryFromFact } = await import("@/server/memory/storage");
    const { archiveMemory, softDeleteMemory } = await import("@/server/memory/lifecycle");

    const view = await insertMemoryFromFact(a.id, ws.id, fact("lifecycle test"), {});
    const archived = await archiveMemory(a.id, view.id);
    expect(archived?.state).toBe("archived");
    const deleted = await softDeleteMemory(a.id, view.id);
    expect(deleted?.state).toBe("deleted");

    await queryTenant(null, `DELETE FROM users WHERE id = ANY($1)`, [[a.id, b.id]]);
  });

  it("retry resets a failed job to pending", async () => {
    const { queryTenant, a, b, ws } = await setup();
    const { enqueueJob, failJob, resetJobForRetry, getJob } = await import("@/server/memory/queue");

    const job = await enqueueJob(a.id, ws.id, "embedding", randomUUID());
    await failJob(job.id, "provider down", true);
    const afterFail = await getJob(job.id);
    expect(afterFail?.state).toBe("retryable");
    await resetJobForRetry(job.id);
    const afterReset = await getJob(job.id);
    expect(afterReset?.state).toBe("pending");

    await queryTenant(null, `DELETE FROM users WHERE id = ANY($1)`, [[a.id, b.id]]);
  });
});
