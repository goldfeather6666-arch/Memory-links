import { NextResponse } from "next/server";
import { getCurrentSession } from "@/server/auth/session";
import { isSupabaseConfigured } from "@/lib/env";

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Sign-in isn't configured for this environment yet." }, { status: 503 });
  }
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ user: null }, { status: 401 });
  }
  return NextResponse.json({
    user: {
      id: session.id,
      email: session.email,
      displayName: session.displayName,
      avatarUrl: session.avatarUrl,
    },
  });
}
