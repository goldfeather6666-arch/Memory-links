import { NextResponse } from "next/server";
import { verifyEmail } from "@/server/auth/service";
import { verifyEmailSchema } from "@/server/validation/schemas";

export async function GET(req: Request) {
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
