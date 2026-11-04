import { cookies } from "next/headers";
import { createServerSupabaseClientAsync } from "@/lib/supabase/server";
import type { User } from "@/db/schema";

export interface SessionUser extends User {
  sessionId: string;
}

/**
 * Resolve the current authenticated user from the Supabase Auth session.
 *
 * This is the single session authority for the app. It reads the Supabase SSR
 * cookie bag (set at sign-in/sign-up and refreshed by the proxy) and returns
 * the user profile. No legacy DB session lookup is performed, so auth works
 * even when DATABASE_URL is not configured.
 */
export async function getCurrentSession(): Promise<SessionUser | null> {
  try {
    const sb = await createServerSupabaseClientAsync();
    const {
      data: { user },
      error,
    } = await sb.auth.getUser();
    if (error || !user) return null;

    const displayName =
      (user.user_metadata?.display_name as string | undefined) ??
      (user.user_metadata?.name as string | undefined) ??
      null;
    const avatarUrl =
      (user.user_metadata?.avatar_url as string | undefined) ?? null;

    return {
      sessionId: user.id,
      id: user.id,
      email: user.email ?? "",
      displayName,
      avatarUrl,
      emailVerified: Boolean(user.email_confirmed_at),
      createdAt: user.created_at ?? "",
      updatedAt: user.updated_at ?? user.last_sign_in_at ?? "",
    };
  } catch {
    return null;
  }
}

/** Touch/renew is delegated to Supabase token refresh; best-effort no-op. */
export async function touchSession(_sessionId: string): Promise<void> {
  // Supabase refreshes the SSR session token automatically; nothing to persist.
}

/** Clear the Supabase session cookie (server-side sign-out). */
export async function destroySession(): Promise<void> {
  try {
    const sb = await createServerSupabaseClientAsync();
    await sb.auth.signOut();
  } catch {
    // ignore — cookie clearing also happens client-side
  }
}

/** Sign out every session for a user via Supabase (all device sessions). */
export async function destroySessionsForUser(_userId: string): Promise<void> {
  try {
    const sb = await createServerSupabaseClientAsync();
    await sb.auth.signOut({ scope: "global" });
  } catch {
    // best-effort
  }
}

export const SESSION_COOKIE = "sb-auth-token";
