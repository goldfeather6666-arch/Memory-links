import { NextResponse } from "next/server";
import { resendVerificationEmail } from "@/server/auth/service";
import { emailSchema } from "@/server/validation/schemas";
import { checkAuthRateLimit, getClientRequestIp } from "@/server/auth/rate-limit";

function emailFromBody(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const record = body as Record<string, unknown>;
  return typeof record.email === "string" && record.email.trim()
    ? record.email.trim().toLowerCase()
    : null;
}

/**
 * Re-issue a verification email for an unverified account. Mirrors the
 * signin/signup rate-limiting and validation pattern. The service swallows
 * account existence to avoid enumeration; emailSent reflects real delivery.
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const key = emailFromBody(body) ?? getClientRequestIp(req);
  const rl = await checkAuthRateLimit(key, "resend-verification");
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

  const parsed = emailSchema.safeParse(emailFromBody(body));
  if (!parsed.success) {
    const first = parsed.error.issues[0]?.message ?? "Validation failed.";
    return NextResponse.json({ error: first }, { status: 400 });
  }

  const { emailSent } = await resendVerificationEmail(parsed.data);
  return NextResponse.json({ ok: true, emailSent });
}
