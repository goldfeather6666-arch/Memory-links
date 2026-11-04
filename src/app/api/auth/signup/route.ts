import { NextResponse } from "next/server";
import { signup } from "@/server/auth/service";
import { signupSchema } from "@/server/validation/schemas";
import { checkAuthRateLimit, getClientRequestIp } from "@/server/auth/rate-limit";
import { isSupabaseConfigured } from "@/lib/env";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Sign-up isn't configured for this environment yet." },
      { status: 503 },
    );
  }

  const key = getClientRequestIp(req);
  const rl = await checkAuthRateLimit(key, "signup");
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

  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0]?.message ?? "Validation failed.";
    return NextResponse.json({ error: first }, { status: 400 });
  }

  const result = await signup(parsed.data);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? "Could not create account." },
      { status: 400 },
    );
  }

  if (result.sessionCreated) {
    return NextResponse.json({ ok: true, sessionCreated: true, user: result.user });
  }

  return NextResponse.json({
    ok: true,
    sessionCreated: false,
    message: "Account created. Confirm your email to sign in.",
  });
}
