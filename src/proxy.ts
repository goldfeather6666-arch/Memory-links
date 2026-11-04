import { NextResponse, type NextRequest } from "next/server";

/**
 * Supabase SSR writes session tokens to cookies named sb-<ref>-auth-token.
 * Because the project ref is only known at deploy time, we detect any cookie
 * matching that shape rather than a fixed name.
 */
function hasSupabaseSessionCookie(req: NextRequest): boolean {
  for (const cookie of req.cookies.getAll()) {
    if (cookie.name.startsWith("sb-") && cookie.name.endsWith("-auth-token")) {
      return true;
    }
  }
  return false;
}

/**
 * Proxy gate for protected areas. This is the Next.js 16 successor to
 * `middleware` (renamed convention). It performs a cheap cookie-presence
 * check: if a Supabase session cookie is absent, redirect to sign-in. The
 * actual, authoritative session validation happens server-side in the /app
 * layout and every data-access call, so this proxy is a UX-level guard, not
 * the security boundary.
 */
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const hasSessionCookie = hasSupabaseSessionCookie(req);

  if (pathname.startsWith("/app") && !hasSessionCookie) {
    const signinUrl = new URL("/signin", req.url);
    signinUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(signinUrl);
  }

  // Authenticated users visiting sign-in pages get routed to the dashboard.
  if (
    hasSessionCookie &&
    ["/signin", "/signup"].includes(pathname)
  ) {
    return NextResponse.redirect(new URL("/app", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*", "/signin", "/signup"],
};
