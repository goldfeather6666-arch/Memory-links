import { NextResponse } from "next/server";
import { verifyEmail } from "@/server/auth/service";
import { verifyEmailSchema } from "@/server/validation/schemas";
import { checkAuthRateLimit, getClientRequestIp } from "@/server/auth/rate-limit";

export async function GET(req: Request) {
  const key = getClientRequestIp(req);
  const rl = await checkAuthRateLimit(key, "verify-email");
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

  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? "";
  const parsed = verifyEmailSchema.safeParse({ token });
  if (!parsed.success) {
    return NextResponse.json({ error: "Missing verification token." }, { status: 400 });
  }

  const result = await verifyEmail(parsed.data.token);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
