import { createHash, randomBytes } from "crypto";
import { cookies } from "next/headers";
import { queryTenant } from "@/db/client";
import type { Session, User } from "@/db/schema";
import { getServerEnv } from "@/lib/env";
import { SESSION_COOKIE } from "@/server/auth/constants";

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

export interface SessionUser extends User {
  sessionId: string;
}

/**
 * Create a session for a user, returning the raw (opaque) token that should
 * be placed in the cookie. Only the SHA-256 hash is persisted.
 */
export async function createSession(userId: string): Promise<string> {
  const token = generateToken();
  const tokenHash = sha256(token);
  const ttlDays = getServerEnv().SESSION_TTL_DAYS;
  await queryTenant(userId, `INSERT INTO sessions (user_id, token_hash, expires_at)
    VALUES ($1, $2, now() + make_interval(days => $3))`, [
    userId,
    tokenHash,
    ttlDays,
  ]);
  return token;
}

async function sessionByToken(token: string): Promise<SessionUser | null> {
  const tokenHash = sha256(token);
  const rows = await queryTenant(
    null,
    `SELECT s.id AS session_id, u.id, u.email, u.display_name, u.avatar_url,
            u.email_verified, u.created_at, u.updated_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > now()
      LIMIT 1`,
    [tokenHash],
  );
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    sessionId: r.session_id,
    id: r.id,
    email: r.email,
    displayName: r.display_name,
    avatarUrl: r.avatar_url,
    emailVerified: r.email_verified,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

/** Read the current session from the request cookie. */
export async function getCurrentSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return sessionByToken(token);
}

/** Touch last_seen_at (best-effort). */
export async function touchSession(sessionId: string): Promise<void> {
  try {
    await queryTenant(null, `UPDATE sessions SET last_seen_at = now() WHERE id = $1`, [sessionId]);
  } catch {
    // non-fatal
  }
}

export async function destroySession(token: string | undefined): Promise<void> {
  if (!token) return;
  const tokenHash = sha256(token);
  await queryTenant(null, `DELETE FROM sessions WHERE token_hash = $1`, [tokenHash]);
}

export interface SessionRow {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: string;
  createdAt: string;
  lastSeenAt: string | null;
}
