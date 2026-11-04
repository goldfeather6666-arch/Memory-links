import { NextResponse } from "next/server";
import { signin } from "@/server/auth/service";
import { createSession } from "@/server/auth/session";
import { SESSION_COOKIE } from "@/server/auth/constants";
import { signinSchema } from "@/server/validation/schemas";
import { checkAuthRateLimit, getClientRequestIp } from "@/server/auth/rate-limit";

function emailFromBody(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const record = body as Record<string, unknown>;
  return typeof record.email === "string" && record.email.trim()
    ? record.email.trim().toLowerCase()
    : null;
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const key = emailFromBody(body) ?? getClientRequestIp(req);
  const rl = await checkAuthRateLimit(key, "signin");
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
      {
        status: 429,
        headers:
          rl.retryAfterSeconds !== undefined
            ? { "Retry-After": String(rl.retryAfterSeconds) }
            : {},
      },
    );
  }

  const parsed = signinSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0]?.message ?? "Validation failed.";
    return NextResponse.json({ error: first }, { status: 400 });
  }

  const { user, error } = await signin(parsed.data.email, parsed.data.password);
  if (!user || error) {
    return NextResponse.json({ error: error ?? "Unable to sign in." }, { status: 401 });
  }

  const token = await createSession(user.id);
  const response = NextResponse.json(
    { ok: true, user: { id: user.id, email: user.email, displayName: user.displayName } },
    { status: 200 },
  );

  // Secure httpOnly session cookie.
  const days = 30;
  response.cookies.set({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
  });

  return response;
}
