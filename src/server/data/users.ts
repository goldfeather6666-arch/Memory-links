import { queryTenant } from "@/db/client";
import type { User } from "@/db/schema";

export async function getPublicByEmail(email: string): Promise<User | null> {
  const rows = await queryTenant<User>(
    null,
    `SELECT id, email, display_name AS "displayName", avatar_url AS "avatarUrl",
            email_verified AS "emailVerified", created_at AS "createdAt",
            updated_at AS "updatedAt"
       FROM users WHERE email = $1 LIMIT 1`,
    [email],
  );
  return rows[0] ?? null;
}

export async function getUserById(id: string): Promise<User | null> {
  const rows = await queryTenant<User>(
    id,
    `SELECT id, email, display_name AS "displayName", avatar_url AS "avatarUrl",
            email_verified AS "emailVerified", created_at AS "createdAt",
            updated_at AS "updatedAt"
       FROM users WHERE id = $1 LIMIT 1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function getPasswordHash(email: string): Promise<string | null> {
  const rows = await queryTenant<{ passwordHash: string }>(
    null,
    `SELECT password_hash AS "passwordHash" FROM users WHERE email = $1 LIMIT 1`,
    [email],
  );
  return rows[0]?.passwordHash ?? null;
}

export async function updateUserDisplayName(
  userId: string,
  displayName: string,
  avatarUrl: string | null,
): Promise<void> {
  await queryTenant(
    userId,
    `UPDATE users SET display_name = $2, avatar_url = $3 WHERE id = $1`,
    [userId, displayName, avatarUrl],
  );
}

export async function setEmailVerified(userId: string): Promise<void> {
  await queryTenant(
    userId,
    `UPDATE users SET email_verified = true WHERE id = $1`,
    [userId],
  );
}

export async function updatePasswordHash(userId: string, passwordHash: string): Promise<void> {
  await queryTenant(
    userId,
    `UPDATE users SET password_hash = $2 WHERE id = $1`,
    [userId, passwordHash],
  );
}
