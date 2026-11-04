import { NextResponse } from "next/server";
import { signin } from "@/server/auth/service";
import { signinSchema } from "@/server/validation/schemas";
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
      { error: "Sign-in isn't configured for this environment yet." },
      { status: 503 },
    );
  }

  const key = getClientRequestIp(req);
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

  const result = await signin(parsed.data.email, parsed.data.password);
  if (!result.user) {
    return NextResponse.json({ error: result.error ?? "Invalid email or password." }, { status: 401 });
  }

  return NextResponse.json({ ok: true, user: result.user });
}
