/**
 * Shared Supabase-related types for the MNEMOSYNE auth bridge.
 */

/** The subset of a Supabase authenticated user we surface to the app. */
export interface AuthUserProfile {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  emailVerified: boolean;
}
