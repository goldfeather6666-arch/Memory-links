import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/server/auth/session";
import { deleteAssistantMessage, getMessage } from "@/server/conversations/data";

/**
 * DELETE /api/v1/conversations/:id/messages/:messageId
 * Removes a failed/partial assistant message so a retry/regenerate can produce
 * a clean replacement without duplicates. Only assistant messages may be
 * removed; user messages are never deleted (provenance preserved).
 */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string; messageId: string }> }) {
  const { messageId } = await ctx.params;
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const msg = await getMessage(session.id, messageId);
    if (!msg) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (msg.status === "completed") {
      return NextResponse.json({ error: "Completed messages cannot be deleted" }, { status: 409 });
    }
    const ok = await deleteAssistantMessage(session.id, messageId);
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "FORBIDDEN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
