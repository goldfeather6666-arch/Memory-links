import { NextResponse } from "next/server";
import { signout } from "@/server/auth/service";

export async function POST(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? undefined;
  try {
    await signout(token);
  } catch {
    // cookie clearing is best-effort; still report success to client
  }
  return NextResponse.json({ ok: true });
}
