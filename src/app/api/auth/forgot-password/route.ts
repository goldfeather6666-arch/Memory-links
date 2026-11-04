import { NextResponse } from "next/server";
import { requestPasswordReset } from "@/server/auth/service";
import { forgotPasswordSchema } from "@/server/validation/schemas";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
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
