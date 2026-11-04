/**
 * Supabase configuration.
 *
 * Browser (Vite/Next client): VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY
 * (legacy-compatible VITE_SUPABASE_ANON_KEY).
 * Server: SUPABASE_URL + SUPABASE_PUBLISHABLE_KEY (legacy-compatible
 * SUPABASE_ANON_KEY).
 *
 * The publishable/anon key is safe for the browser. Service-role keys are
 * never referenced here.
 */

function firstDefined(...values: Array<string | undefined>): string | undefined {
  for (const v of values) {
    if (v && v.trim()) return v.trim();
  }
  return undefined;
}

/** Browser-facing Supabase URL (VITE_ or NEXT_PUBLIC_). */
export const SUPABASE_URL =
  firstDefined(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_URL,
  ) ?? "";

/** Browser-facing publishable/anon key. */
export const SUPABASE_PUBLISHABLE_KEY =
  firstDefined(
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    process.env.VITE_SUPABASE_ANON_KEY,
    process.env.SUPABASE_PUBLISHABLE_KEY,
    process.env.SUPABASE_ANON_KEY,
  ) ?? "";

/** True only when a usable Supabase (URL + publishable key) is configured. */
export function isSupabaseConfigured(): boolean {
  return SUPABASE_URL.length > 0 && SUPABASE_PUBLISHABLE_KEY.length > 0;
}

/**
 * Minimal guard used by auth surfaces: returns a user-facing, honest message
 * describing the missing configuration instead of a generic 500.
 */
export function supabaseUnconfiguredMessage(): string {
  return "Sign-in isn't configured for this environment yet.";
}
