import { NextResponse } from "next/server";
import { resetPassword } from "@/server/auth/service";
import { resetPasswordSchema } from "@/server/validation/schemas";
import { checkAuthRateLimit, getClientRequestIp } from "@/server/auth/rate-limit";
import { isDatabaseConfigured } from "@/lib/env";

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

  const key = getClientRequestIp(req);
  const rl = await checkAuthRateLimit(key, "reset-password");
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

  const parsed = resetPasswordSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0]?.message ?? "Validation failed.";
    return NextResponse.json({ error: first }, { status: 400 });
  }

  const result = await resetPassword(parsed.data.token, parsed.data.password);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
