import { NextResponse } from "next/server";
import { requestPasswordReset } from "@/server/auth/service";
import { forgotPasswordSchema } from "@/server/validation/schemas";
import { checkAuthRateLimit, getClientRequestIp } from "@/server/auth/rate-limit";
import { isDatabaseConfigured } from "@/lib/env";

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

  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: "Password reset isn't configured for this environment yet." },
      { status: 503 },
    );
  }

  const key = emailFromBody(body) ?? getClientRequestIp(req);
  const rl = await checkAuthRateLimit(key, "forgot-password");
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

  const parsed = forgotPasswordSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0]?.message ?? "Validation failed.";
    return NextResponse.json({ error: first }, { status: 400 });
  }

  await requestPasswordReset(parsed.data.email);
  return NextResponse.json({
    ok: true,
    message: "If an account exists for that email, a reset link has been sent.",
  });
}
