import { hashPassword, verifyPassword } from "@/server/auth/password";
import { destroySession } from "@/server/auth/session";
import { recordAuditEvent } from "@/server/data/audit";
import {
  createAuthToken,
  consumeAuthToken,
  revokeActorTokensForUser,
} from "@/server/data/auth-tokens";
import {
  getPasswordHash,
  setEmailVerified,
  updatePasswordHash,
} from "@/server/data/users";
import { buildActionUrl, sendMail } from "@/server/mail/transport";
import { queryTenant } from "@/db/client";
import type { User } from "@/db/schema";

export interface SignupInput {
  email: string;
  displayName: string;
  password: string;
}

export interface SignupResult {
  user: User;
  emailSent: boolean;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Create a new user. Returns the user and whether a verification email was
 * actually delivered (a transport may be dev-limited).
 */
export async function signup(input: SignupInput): Promise<SignupResult> {
  const email = normalizeEmail(input.email);
  const passwordHash = await hashPassword(input.password);

  const rows = await queryTenant<{
    id: string;
    email: string;
    displayName: string | null;
    avatarUrl: string | null;
    emailVerified: boolean;
    createdAt: string;
    updatedAt: string;
  }>(
    null,
    `INSERT INTO users (email, display_name, password_hash)
     VALUES ($1, $2, $3)
     RETURNING id, email, display_name AS "displayName", avatar_url AS "avatarUrl",
               email_verified AS "emailVerified", created_at AS "createdAt",
               updated_at AS "updatedAt"`,
    [email, input.displayName.trim(), passwordHash],
  );
  const row = rows[0];
  const user: User = {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    avatarUrl: row.avatarUrl,
    emailVerified: row.emailVerified,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };

  await recordAuditEvent({ actorId: user.id, action: "auth.signup" });

  // Issue verification token + email.
  const token = await createAuthToken(user.id, "email_verify");
  const url = buildActionUrl(`/verify-email?token=${encodeURIComponent(token)}`);
  let emailSent = false;
  try {
    await sendMail({
      to: user.email,
      subject: "Verify your MNEMOSYNE email",
      text: `Welcome to MNEMOSYNE! Confirm your email by visiting:\n\n${url}\n\nThis link expires in 24 hours.`,
    });
    emailSent = true;
  } catch {
    // Delivery failure (e.g. SMTP unconfigured). The account is created; we
    // surface this honestly to the caller.
    emailSent = false;
  }

  return { user, emailSent };
}

export interface SigninResult {
  user: User | null;
  error: string | null;
}

export async function signin(
  emailInput: string,
  password: string,
): Promise<SigninResult> {
  const email = normalizeEmail(emailInput);
  const hash = await getPasswordHash(email);
  if (!hash) {
    return { user: null, error: "Invalid email or password." };
  }
  const ok = await verifyPassword(password, hash);
  if (!ok) {
    return { user: null, error: "Invalid email or password." };
  }
  const rows = await queryTenant<{ id: string; emailVerified: boolean }>(
    null,
    `SELECT id, email_verified AS "emailVerified" FROM users WHERE email = $1 LIMIT 1`,
    [email],
  );
  const row = rows[0];
  if (!row) {
    return { user: null, error: "Invalid email or password." };
  }
  if (!row.emailVerified) {
    return { user: null, error: "Please verify your email before signing in." };
  }

  await recordAuditEvent({ actorId: row.id, action: "auth.signin" });

  const rowsUser = await queryTenant<{
    id: string; email: string; displayName: string | null;
    avatarUrl: string | null; emailVerified: boolean;
    createdAt: string; updatedAt: string;
  }>(
    row.id,
    `SELECT id, email, display_name AS "displayName", avatar_url AS "avatarUrl",
            email_verified AS "emailVerified", created_at AS "createdAt",
            updated_at AS "updatedAt"
       FROM users WHERE id = $1 LIMIT 1`,
    [row.id],
  );
  const u = rowsUser[0];
  return {
    user: {
      id: u.id,
      email: u.email,
      displayName: u.displayName,
      avatarUrl: u.avatarUrl,
      emailVerified: u.emailVerified,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
    },
    error: null,
  };
}

export async function verifyEmail(rawToken: string): Promise<{ ok: boolean; error?: string }> {
  const userId = await consumeAuthToken(rawToken, "email_verify");
  if (!userId) {
    return { ok: false, error: "Invalid, expired, or already-used verification token." };
  }
  await setEmailVerified(userId);
  await recordAuditEvent({ actorId: userId, action: "auth.email_verified" });
  return { ok: true };
}

export async function requestPasswordReset(emailInput: string): Promise<{ ok: boolean }> {
  const email = normalizeEmail(emailInput);
  const rows = await queryTenant<{ id: string }>(
    null,
    `SELECT id FROM users WHERE email = $1 LIMIT 1`,
    [email],
  );
  if (rows.length === 0) {
    // Do not reveal whether an account exists.
    return { ok: true };
  }
  const userId = rows[0].id;
  const token = await createAuthToken(userId, "password_reset");
  const url = buildActionUrl(`/reset-password?token=${encodeURIComponent(token)}`);
  try {
    await sendMail({
      to: email,
      subject: "Reset your MNEMOSYNE password",
      text: `You requested a password reset. Set a new password here:\n\n${url}\n\nIf you did not request this, ignore this email. The link expires in 24 hours.`,
    });
  } catch {
    // swallow: no leak; caller sees ok, dev transport logs link.
  }
  await recordAuditEvent({ actorId: userId, action: "auth.reset_requested" });
  return { ok: true };
}

export async function resetPassword(
  rawToken: string,
  newPassword: string,
): Promise<{ ok: boolean; error?: string }> {
  const userId = await consumeAuthToken(rawToken, "password_reset");
  if (!userId) {
    return { ok: false, error: "Invalid, expired, or already-used reset token." };
  }
  const newHash = await hashPassword(newPassword);
  await updatePasswordHash(userId, newHash);
  await revokeActorTokensForUser(userId);
  await recordAuditEvent({ actorId: userId, action: "auth.password_reset" });
  return { ok: true };
}

export async function signout(rawToken: string | undefined): Promise<void> {
  await destroySession(rawToken);
}
