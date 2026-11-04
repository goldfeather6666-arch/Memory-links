import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/server/auth/session";
import { getConversation, getMessage } from "@/server/conversations/data";
import { captureUserTurn } from "@/server/conversations/capture";

/**
 * POST /api/v1/chat/capture — explicit "Remember this" for a user message.
 * Body: { conversationId, messageId }. Forces capture regardless of the
 * automatic setting (user-consented action).
 */
export async function POST(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: { conversationId?: string; messageId?: string } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const { conversationId, messageId } = body;
  if (!conversationId || !messageId) {
    return NextResponse.json({ error: "conversationId and messageId are required" }, { status: 400 });
  }
  try {
    const conversation = await getConversation(session.id, conversationId);
    if (!conversation) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const message = await getMessage(session.id, messageId);
    if (!message || message.conversationId !== conversationId || message.role !== "user") {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }
    const result = await captureUserTurn(session.id, conversation.workspaceId, conversationId, message, {
      force: true,
    });
    if (!result) {
      return NextResponse.json({ error: "Nothing to capture" }, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "FORBIDDEN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
