import { describe, expect, it } from "vitest";
import { deriveTemporalInfo } from "@/server/intelligence/temporal";

describe("deriveTemporalInfo", () => {
  it("maps snake_case columns to TemporalInfo", () => {
    const info = deriveTemporalInfo({
      occurred_at: "2026-01-15T00:00:00.000Z",
      created_at: "2026-01-16T00:00:00.000Z",
      valid_from: "2026-01-01T00:00:00.000Z",
      valid_until: null,
      updated_at: "2026-01-16T00:00:00.000Z",
      version: 2,
    });
    expect(info.occurredAt).toBe("2026-01-15T00:00:00.000Z");
    expect(info.createdAt).toBe("2026-01-16T00:00:00.000Z");
    expect(info.validFrom).toBe("2026-01-01T00:00:00.000Z");
    expect(info.validUntil).toBeNull();
    expect(info.version).toBe(2);
  });

  it("never invents a missing event date", () => {
    const info = deriveTemporalInfo({
      occurred_at: null,
      created_at: "2026-01-01T00:00:00.000Z",
      valid_from: null,
      valid_until: null,
      updated_at: "2026-01-01T00:00:00.000Z",
      version: 1,
    });
    expect(info.occurredAt).toBeNull();
  });

  it("accepts camelCase rows (already-mapped shape)", () => {
    const info = deriveTemporalInfo({
      occurredAt: "2026-02-01T00:00:00.000Z",
      createdAt: "2026-02-01T00:00:00.000Z",
      validFrom: null,
      validUntil: null,
      updatedAt: "2026-02-01T00:00:00.000Z",
      version: 1,
    });
    expect(info.occurredAt).toBe("2026-02-01T00:00:00.000Z");
    expect(info.createdAt).toBe("2026-02-01T00:00:00.000Z");
  });

  it("defaults version to 1 when absent", () => {
    const info = deriveTemporalInfo({ created_at: "2026-01-01T00:00:00.000Z" });
    expect(info.version).toBe(1);
  });
});
