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
    sameSite?: boolean | "lax" | "strict" | "none";
  };
}>;

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
