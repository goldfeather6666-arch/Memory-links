import { NextResponse } from "next/server";
import { getCurrentSession, touchSession } from "@/server/auth/session";
import { listWorkspacesForUser } from "@/server/data/workspaces";

export async function GET() {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ user: null }, { status: 200 });
  }
  await touchSession(session.sessionId).catch(() => {});
  const workspaces = await listWorkspacesForUser(session.id);
  return NextResponse.json({ user: session, workspaces });
}
