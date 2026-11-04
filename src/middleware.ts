import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/server/auth/constants";

/**
 * Middleware gate for protected areas. It performs a cheap cookie-presence
 * check: if the session cookie is absent, redirect to sign-in. The actual,
 * authoritative session validation happens server-side in the /app layout and
 * every data-access call, so this middleware is a UX-level guard, not the
 * security boundary.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const hasSessionCookie = Boolean(req.cookies.get(SESSION_COOKIE)?.value);

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
