import { createHash } from "crypto";
import { queryTenant } from "@/db/client";
import { generateToken } from "@/server/auth/session";

export type TokenPurpose = "email_verify" | "password_reset";

export function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Create an auth token; returns the raw token (only the hash is stored). */
export async function createAuthToken(
  userId: string,
  purpose: TokenPurpose,
  ttlHours = 24,
): Promise<string> {
  const token = generateToken();
  const hash = tokenHash(token);
  await queryTenant(
    userId,
    `INSERT INTO auth_tokens (token_hash, user_id, purpose, expires_at)
     VALUES ($1, $2, $3, now() + make_interval(hours => $4))`,
    [hash, userId, purpose, ttlHours],
  );
  return token;
}

/**
 * Consume a token for the given purpose. Returns the user id if valid and
 * unused, otherwise null. Marks the token used (idempotent).
 */
export async function consumeAuthToken(
  rawToken: string,
  purpose: TokenPurpose,
): Promise<string | null> {
  const hash = tokenHash(rawToken);
  const rows = await queryTenant<{ userId: string }>(
    null,
    `UPDATE auth_tokens
        SET used_at = now()
      WHERE token_hash = $1 AND purpose = $2
        AND used_at IS NULL AND expires_at > now()
      RETURNING user_id AS "userId"`,
    [hash, purpose],
  );
  return rows[0]?.userId ?? null;
}

export async function revokeActorTokensForUser(userId: string): Promise<void> {
  await queryTenant(
    userId,
    `UPDATE auth_tokens SET used_at = now() WHERE user_id = $1`,
    [userId],
  );
}
