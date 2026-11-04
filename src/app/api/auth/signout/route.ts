import { NextResponse } from "next/server";
import { signout } from "@/server/auth/service";

export async function POST() {
  try {
    await signout();
  } catch {
    // cookie clearing is best-effort; still report success to client
  }
  return NextResponse.json({ ok: true });
}
