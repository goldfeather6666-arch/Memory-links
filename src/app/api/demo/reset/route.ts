import { NextResponse } from "next/server";
import { getCurrentSession } from "@/server/auth/session";
import { resetDemoWorkspace } from "@/server/demo/reset";

export async function POST() {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await resetDemoWorkspace(session.id);
    return NextResponse.json({ ok: true, ...result });
  } catch {
    return NextResponse.json({ error: "database_unavailable" }, { status: 503 });
  }
}
