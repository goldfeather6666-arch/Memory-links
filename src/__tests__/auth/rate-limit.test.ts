import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkAuthRateLimit } from "@/server/auth/rate-limit";

interface FakeRow {
  attempt_count: number;
  lockout_level: number;
  first_attempt_at: string;
  locked_until: string | null;
}

const store = new Map<string, FakeRow>();

function rowId(key: string, action: string): string {
  return `${action}:${key}`;
}

function seed(
  key: string,
  action: string,
  row: Partial<FakeRow> & { first_attempt_at: string },
): void {
  store.set(rowId(key, action), {
    attempt_count: 0,
    lockout_level: 0,
    locked_until: null,
    ...row,
  });
}

/**
 * In-memory simulation of the auth_attempts table. The guard's queryTenant
 * calls are routed here and state is mutated like Postgres would.
 */
const mockQueryTenant = vi.fn(
  async (_userId: string | null, text: string, values: unknown[] = []) => {
    const key = String(values[0]);
    const action = String(values[1]);
    const id = rowId(key, action);
    const sql = text.trim();

    if (sql.startsWith("INSERT")) {
      if (!store.has(id)) {
        store.set(id, {
          attempt_count: 0,
          lockout_level: 0,
          first_attempt_at: new Date().toISOString(),
          locked_until: null,
        });
      }
      return [];
    }

    if (sql.startsWith("SELECT")) {
      const row = store.get(id);
      return row ? [{ ...row }] : [];
    }

    // UPDATE
    const row = store.get(id);
    if (row) {
      row.attempt_count = Number(values[2]);
      row.first_attempt_at = String(values[3]);
      if (values.length === 5) {
        row.locked_until = String(values[4]);
        row.lockout_level += 1;
      } else {
        row.locked_until = null;
      }
    }
    return [];
  },
);

vi.mock("@/db/client", () => ({
  queryTenant: (
    _userId: string | null,
    text: string,
    values?: unknown[],
  ) => mockQueryTenant(_userId, text, values ?? []),
}));

const T0 = new Date("2026-01-15T00:00:00Z");

describe("checkAuthRateLimit", () => {
  beforeEach(() => {
    store.clear();
    mockQueryTenant.mockClear();
    vi.useFakeTimers();
    vi.setSystemTime(T0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows requests under the per-window limit", async () => {
    const first = await checkAuthRateLimit("alice@example.com", "signin");
    expect(first.allowed).toBe(true);
    const second = await checkAuthRateLimit("alice@example.com", "signin");
    expect(second.allowed).toBe(true);
    expect(mockQueryTenant).toHaveBeenCalled();
  });

  it("blocks once the limit is exceeded and reports retry-after", async () => {
    seed("bob@example.com", "signin", {
      attempt_count: 9,
      lockout_level: 0,
      first_attempt_at: T0.toISOString(),
      locked_until: null,
    });

    const ok = await checkAuthRateLimit("bob@example.com", "signin");
    expect(ok.allowed).toBe(true); // 10th attempt: allowed

    const blocked = await checkAuthRateLimit("bob@example.com", "signin");
    expect(blocked.allowed).toBe(false); // 11th attempt: blocked
    expect(blocked.retryAfterSeconds).toBe(60); // base cooldown
  });

  it("keeps blocking during the active cooldown", async () => {
    seed("carol@example.com", "signup", {
      attempt_count: 4,
      lockout_level: 0,
      first_attempt_at: T0.toISOString(),
      locked_until: null,
    });

    await checkAuthRateLimit("carol@example.com", "signup"); // 5th allowed
    const firstBlock = await checkAuthRateLimit("carol@example.com", "signup"); // 6th blocked
    expect(firstBlock.allowed).toBe(false);
    const retryAfter = firstBlock.retryAfterSeconds ?? 0;

    // Same instant: still inside the cooldown.
    const during = await checkAuthRateLimit("carol@example.com", "signup");
    expect(during.allowed).toBe(false);
    expect(during.retryAfterSeconds).toBeLessThanOrEqual(retryAfter);
  });

  it("grows the cooldown exponentially across repeated overflows", async () => {
    seed("dave@example.com", "signin", {
      attempt_count: 9,
      lockout_level: 0,
      first_attempt_at: T0.toISOString(),
      locked_until: null,
    });

    await checkAuthRateLimit("dave@example.com", "signin");
    const firstBlock = await checkAuthRateLimit("dave@example.com", "signin");
    expect(firstBlock.retryAfterSeconds).toBe(60);

    // Wait out the cooldown but stay inside the 15-minute window.
    vi.setSystemTime(new Date(T0.getTime() + 61 * 1000));
    const secondBlock = await checkAuthRateLimit("dave@example.com", "signin");
    expect(secondBlock.allowed).toBe(false);
    expect(secondBlock.retryAfterSeconds).toBe(120); // 60 * 2^1
  });

  it("resets after the window rolls over and the cooldown expires", async () => {
    seed("erin@example.com", "signin", {
      attempt_count: 11,
      lockout_level: 2,
      first_attempt_at: T0.toISOString(),
      locked_until: new Date(T0.getTime() + 180 * 1000).toISOString(),
    });

    vi.setSystemTime(new Date(T0.getTime() + 901 * 1000));
    const result = await checkAuthRateLimit("erin@example.com", "signin");
    expect(result.allowed).toBe(true);
  });
});
