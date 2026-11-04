import { describe, expect, it } from "vitest";
import {
  computeContentHash,
  normalizeRaw,
  summarizeSource,
} from "@/server/connectors/normalize";

const base = {
  provider: "github" as const,
  connectionId: "conn-1",
  workspaceId: "ws-1",
  externalId: "ext-1",
  recordType: "issue",
  title: "Fix login bug",
  content: "The login flow fails on redirect",
  author: "octo",
  timestamp: "2026-01-01T00:00:00.000Z",
  modifiedAt: "2026-01-02T00:00:00.000Z",
  url: "https://github.com/acme/repo/issues/1",
  parentId: null,
  threadId: null,
  fileMeta: null,
  metadata: {},
};

describe("connector normalize", () => {
  it("computeContentHash is stable over identical sources", () => {
    expect(computeContentHash({ ...base })).toBe(computeContentHash({ ...base }));
  });

  it("computeContentHash differs when content changes", () => {
    const changed = { ...base, content: "Different text" };
    expect(computeContentHash(changed)).not.toBe(computeContentHash(base));
  });

  it("computeContentHash differs when external id changes", () => {
    const changed = { ...base, externalId: "ext-2" };
    expect(computeContentHash(changed)).not.toBe(computeContentHash(base));
  });

  it("summarizeSource prefers title", () => {
    expect(summarizeSource(base)).toBe("Fix login bug");
  });

  it("summarizeSource falls back to first 300 chars of content", () => {
    const src = { ...base, title: null, content: "A".repeat(500) };
    expect(summarizeSource(src)).toHaveLength(300);
  });

  it("summarizeSource defaults when no title or content", () => {
    expect(summarizeSource({ ...base, title: null, content: null })).toBe(
      "Untitled source",
    );
  });

  it("normalizeRaw coerces empty strings to null", () => {
    const out = normalizeRaw(
      { externalId: "e1", recordType: "issue" },
      "github",
      "c1",
      "w1",
    );
    expect(out.title).toBeNull();
    expect(out.content).toBeNull();
    expect(out.author).toBeNull();
    expect(out.metadata).toEqual({});
    expect(out.fileMeta).toBeNull();
  });

  it("normalizeRaw preserves provider/connection/workspace context", () => {
    const out = normalizeRaw(
      {
        externalId: "e1",
        recordType: "issue",
        title: "  Title  ",
        metadata: { key: "value" },
      },
      "github",
      "c1",
      "w1",
    );
    expect(out.provider).toBe("github");
    expect(out.connectionId).toBe("c1");
    expect(out.workspaceId).toBe("w1");
    expect(out.title).toBe("Title");
    expect(out.metadata).toEqual({ key: "value" });
  });
});
