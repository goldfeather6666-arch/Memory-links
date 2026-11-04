import { queryTenant } from "@/db/client";

/**
 * MNEMOSYNE — shared, database-backed rate limiter for authentication routes.
 *
 * Abuse protection against brute-force logins, spam signups and token
 * enumeration. Per-action windows, a rolling attempt counter and an
 * exponential lockout (base 60s doubling up to a 1h cap). This defends the
 * 5 auth endpoints (signin, signup, forgot-password, reset-password,
 * verify-email).
 */

export type AuthAction =
  | "signin"
  | "signup"
  | "forgot-password"
  | "reset-password"
  | "verify-email";

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds?: number;
}

const WINDOW_MS = 15 * 60 * 1000;
const BASE_LOCKOUT_MS = 60 * 1000;
const MAX_LOCKOUT_LEVEL = 6; // ~1h cap

const MAX_ATTEMPTS: Record<AuthAction, number> = {
  signin: 10,
  "forgot-password": 10,
  signup: 5,
  "reset-password": 5,
  "verify-email": 5,
};

function lockoutMs(level: number): number {
  return Math.min(BASE_LOCKOUT_MS * 2 ** level, 60 * 60 * 1000);
}

interface AttemptRow {
  attempt_count: number;
  first_attempt_at: string;
  lockout_level: number;
  locked_until: string | null;
}

/**
 * Enforce a per-action, per-key rate limit.
 *
 * @param key opaque identifier (normalized email or client IP)
 * @param action auth action being protected
 */
export async function checkAuthRateLimit(
  key: string,
  action: AuthAction,
): Promise<RateLimitResult> {
  const maxAttempts = MAX_ATTEMPTS[action] ?? 5;

  // Ensure a row exists for (key, action); ON CONFLICT is a no-op when present.
  await queryTenant(
    null,
    `INSERT INTO auth_attempts (bucket_key, action)
     VALUES ($1, $2)
     ON CONFLICT (bucket_key, action) DO NOTHING`,
    [key, action],
  );

  const rows = await queryTenant<AttemptRow>(
    null,
    `SELECT attempt_count, first_attempt_at, lockout_level, locked_until
       FROM auth_attempts
      WHERE bucket_key = $1 AND action = $2`,
    [key, action],
  );

  const row = rows[0];
  const now = Date.now();
  const firstAt = row ? new Date(row.first_attempt_at).getTime() : now;
  const storedLockout = row ? Number(row.lockout_level) : 0;
  const storedLockedUntil = row?.locked_until
    ? new Date(row.locked_until).getTime()
    : null;

  // Active cooldown: reject immediately, report remaining seconds.
  if (storedLockedUntil !== null && now < storedLockedUntil) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((storedLockedUntil - now) / 1000),
    };
  }

  // Window rollover: start fresh on a new sliding window.
  const windowExpired = now - firstAt > WINDOW_MS;
  const effectiveCount = windowExpired ? 0 : Number(row?.attempt_count ?? 0);
  const effectiveLockout = windowExpired ? 0 : storedLockout;

  if (effectiveCount >= maxAttempts) {
    const cooldown = lockoutMs(effectiveLockout);
    const lockedUntilIso = new Date(now + cooldown).toISOString();
    const firstAtIso = new Date(firstAt).toISOString();

    await queryTenant(
      null,
      `UPDATE auth_attempts
          SET attempt_count = $3, first_attempt_at = $4, locked_until = $5,
              lockout_level = lockout_level + 1
        WHERE bucket_key = $1 AND action = $2`,
      [key, action, effectiveCount, firstAtIso, lockedUntilIso],
    );

    return { allowed: false, retryAfterSeconds: Math.round(cooldown / 1000) };
  }

  // Allowed: increment counter, reset the lockout window if it had rolled over.
  const newCount = effectiveCount + 1;
  const newFirstAt = windowExpired ? new Date(now).toISOString() : new Date(firstAt).toISOString();

  await queryTenant(
    null,
    `UPDATE auth_attempts
        SET attempt_count = $3, first_attempt_at = $4, locked_until = NULL
      WHERE bucket_key = $1 AND action = $2`,
    [key, action, newCount, newFirstAt],
  );

  return { allowed: true };
}

/**
 * Best-effort client IP extraction, honoring the X-Forwarded-For header
 * (set by proxies/Vercel) with a fallback to X-Real-IP.
 */
export function getClientRequestIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get("x-real-ip");
  if (real) return real;
  return "unknown";
}
