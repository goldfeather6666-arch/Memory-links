import { createServerSupabaseClientAsync } from "@/lib/supabase/server";
import { destroySession, destroySessionsForUser } from "@/server/auth/session";
import { recordAuditEvent } from "@/server/data/audit";
import { queryTenant } from "@/db/client";
import { ensureDemoWorkspace } from "@/server/demo/seed";
import type { User } from "@/db/schema";

export interface SignupInput {
  email: string;
  displayName: string;
  password: string;
}

export interface SignupResult {
  user: User | null;
  ok: boolean;
  emailSent: boolean;
  /** True when a session was issued immediately (email confirmation disabled). */
  sessionCreated: boolean;
  error?: string;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function toUser(sbUser: {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown>;
  email_confirmed_at?: string | null;
  created_at?: string;
  updated_at?: string;
}): User {
  const meta = sbUser.user_metadata ?? {};
  const displayName =
    (meta.display_name as string | undefined) ??
    (meta.name as string | undefined) ??
    null;
  const avatarUrl = (meta.avatar_url as string | undefined) ?? null;
  return {
    id: sbUser.id,
    email: sbUser.email ?? "",
    displayName,
    avatarUrl,
    emailVerified: Boolean(sbUser.email_confirmed_at),
    createdAt: sbUser.created_at ?? "",
    updatedAt: sbUser.updated_at ?? "",
  };
}

/**
 * Best-effort provisioning of the internal `users` row keyed by the Supabase
 * user id. This keeps the app's data layer consistent with Supabase Auth but
 * never blocks authentication when DATABASE_URL is absent.
 */
async function provisionUserRow(user: User): Promise<void> {
  try {
    // Run as the tenant so the `users_insert` RLS policy (id =
    // app_current_user_id()) passes. Same scoping required for the
    // ON CONFLICT DO UPDATE path via `users_update`.
    await queryTenant(
      user.id,
      `INSERT INTO users (id, email, display_name, avatar_url, email_verified)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET
         email = EXCLUDED.email,
         display_name = COALESCE(EXCLUDED.display_name, users.display_name),
         avatar_url = COALESCE(EXCLUDED.avatar_url, users.avatar_url),
         email_verified = users.email_verified OR EXCLUDED.email_verified`,
      [user.id, user.email, user.displayName, user.avatarUrl, user.emailVerified],
    );
  } catch {
    // Non-fatal: auth continues even if profile seeding is unavailable.
  }
}

/**
 * Best-effort, idempotent demo workspace provisioning. Runs after profile
 * provisioning on signup/signin. Demo data is optional, so failures are
 * swallowed — this must NEVER block authentication.
 */
async function provisionDemoWorkspace(userId: string): Promise<void> {
  try {
    await ensureDemoWorkspace(userId);
  } catch {
    // Non-fatal: demo provisioning must never block auth.
  }
}

/**
 * Create a new account via Supabase Auth. Email verification is removed from
 * the flow: when the Supabase project has "Confirm email" disabled (the
 * required configuration), signUp returns an authenticated session immediately.
 */
export async function signup(input: SignupInput): Promise<SignupResult> {
  const email = normalizeEmail(input.email);
  const sb = await createServerSupabaseClientAsync();
  const { data, error } = await sb.auth.signUp({
    email,
    password: input.password,
    options: {
      data: { display_name: input.displayName.trim() },
      // do not require confirmation redirect — session is immediate
      emailRedirectTo: undefined,
    },
  });

  if (error) {
    return { user: null, ok: false, emailSent: false, sessionCreated: false, error: error.message };
  }

  if (data.session && data.user) {
    const user = toUser(data.user);
    await provisionUserRow(user);
    await provisionDemoWorkspace(user.id);
    await recordAuditEvent({ actorId: user.id, action: "auth.signup" });
    return { user, ok: true, emailSent: false, sessionCreated: true };
  }

  // No session returned (project still requires email confirmation).
  if (data.user) {
    const user = toUser(data.user);
    await provisionUserRow(user);
    await provisionDemoWorkspace(user.id);
    await recordAuditEvent({ actorId: user.id, action: "auth.signup" });
    return {
      user,
      ok: true,
      emailSent: false,
      sessionCreated: false,
      error: "Account created. Confirm your email to sign in (project email confirmation is still enabled).",
    };
  }

  return { user: null, ok: false, emailSent: false, sessionCreated: false, error: "Could not create account." };
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
  const sb = await createServerSupabaseClientAsync();
  const { data, error } = await sb.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    return { user: null, error: error?.message || "Invalid email or password." };
  }

  const user = toUser(data.user);
  await provisionUserRow(user);
  await provisionDemoWorkspace(user.id);
  await recordAuditEvent({ actorId: user.id, action: "auth.signin" });
  return { user, error: null };
}

export interface ResendResult {
  ok: boolean;
  emailSent: boolean;
}

/** Email verification is removed; this is a harmless honest no-op. */
export async function resendVerificationEmail(emailInput: string): Promise<ResendResult> {
  void normalizeEmail(emailInput);
  return { ok: true, emailSent: false };
}

export async function verifyEmail(rawToken: string): Promise<{ ok: boolean; error?: string }> {
  void rawToken;
  return { ok: true };
}

/**
 * Request a password reset via Supabase Auth. Supabase sends the recovery email
 * (its own infrastructure). If no account exists, we still return ok to avoid
 * enumeration.
 */
export async function requestPasswordReset(emailInput: string): Promise<{ ok: boolean }> {
  const email = normalizeEmail(emailInput);
  const sb = await createServerSupabaseClientAsync();
  const { error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || process.env.APP_URL || "http://localhost:3000"}/reset-password`,
  });
  if (error) {
    // Supabase can error on rate limits; do not leak account existence.
    return { ok: true };
  }
  return { ok: true };
}

/**
 * Reset a password. Supports both the legacy custom token path (rawToken) and
 * the Supabase recovery code path (code). When a Supabase code is provided we
 * exchange it, update the password, and invalidate other sessions.
 */
export async function resetPassword(
  rawToken: string,
  newPassword: string,
): Promise<{ ok: boolean; error?: string }> {
  const sb = await createServerSupabaseClientAsync();

  // Supabase recovery flow: exchange code → session, then update password.
  if (rawToken && rawToken.length >= 10 && !rawToken.includes(".")) {
    const { error: exchangeErr } = await sb.auth.exchangeCodeForSession(rawToken);
    if (exchangeErr) {
      // Fall through to legacy token handling below.
    } else {
      const { error: updateErr } = await sb.auth.updateUser({ password: newPassword });
      if (updateErr) {
        return { ok: false, error: updateErr.message };
      }
      const {
        data: { user },
      } = await sb.auth.getUser();
      if (user) {
        await recordAuditEvent({ actorId: user.id, action: "auth.password_reset" });
      }
      return { ok: true };
    }
  }

  // Legacy custom token path (self-managed reset tokens).
  const { consumeAuthToken, revokeActorTokensForUser } = await import(
    "@/server/data/auth-tokens"
  ).then((m) => m);
  const { hashPassword } = await import("@/server/auth/password");
  const { updatePasswordHash } = await import("@/server/data/users");
  const userId = await consumeAuthToken(rawToken, "password_reset");
  if (!userId) {
    return { ok: false, error: "Invalid, expired, or already-used reset token." };
  }
  const newHash = await hashPassword(newPassword);
  await updatePasswordHash(userId, newHash);
  await destroySessionsForUser(userId);
  await revokeActorTokensForUser(userId);
  await recordAuditEvent({ actorId: userId, action: "auth.password_reset" });
  return { ok: true };
}

export async function signout(): Promise<void> {
  await destroySession();
}
