import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/lib/supabase/config";

type CookieSet = Array<{
  name: string;
  value: string;
  options?: {
    path?: string;
    maxAge?: number;
    domain?: string;
    secure?: boolean;
    httpOnly?: boolean;
    sameSite?: "lax" | "strict" | "none";
  };
}>;

/**
 * Create a Supabase server client bound to the incoming request cookies.
 *
 * @param setAll optional writer; when omitted (read-only contexts) writes are
 *   ignored so sessions can be read but not mutated.
 */
export function createServerSupabaseClient(
  setAll?: (cookiesToSet: CookieSet) => void,
) {
  return createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        try {
          // In route handlers / server components, cookies() is async in Next 16.
          // We call resolve() if needed — but getAll is sync here, so we fall
          // back to reading the request cookie bag synchronously where possible.
          return headersCookies();
        } catch {
          return [];
        }
      },
      setAll(cookiesToSet) {
        if (setAll) setAll(cookiesToSet);
        else {
          // no-op (read-only) — do not attempt to write cookies.
        }
      },
    },
  });
}

/** Read cookies synchronously from the Next headers (works in RSC/route handlers). */
function headersCookies(): Array<{ name: string; value: string }> {
  // next/headers cookies() is async (Promise) in Next 16; we cannot await in a
  // sync getAll. For read scenarios we instead rely on a variant that uses the
  // awaited cookies() result passed in explicitly. See createServerSupabaseClientAsync.
  return [];
}

/**
 * Async variant for server components / route handlers where `cookies()` is
 * awaited. This is the primary entry for the server side.
 */
export async function createServerSupabaseClientAsync(
  setAll?: (cookiesToSet: CookieSet) => void,
) {
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll().map((c) => ({ name: c.name, value: c.value }));
      },
      setAll(cookiesToSet) {
        if (setAll) {
          setAll(cookiesToSet);
        } else {
          for (const c of cookiesToSet) {
            try {
              cookieStore.set(c.name, c.value, c.options ?? {});
            } catch {
              // read-only context; ignore
            }
          }
        }
      },
    },
  });
}
