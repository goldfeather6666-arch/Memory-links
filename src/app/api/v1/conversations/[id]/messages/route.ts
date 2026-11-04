import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/server/auth/session";
import {
  getConversation,
  listMessages,
  createUserMessage,
  createAssistantMessage,
  getMessage,
  ensureConversationTitle,
} from "@/server/conversations/data";
import { runChatTurn } from "@/server/chat/engine";
import { updateRollingSummary } from "@/server/conversations/summarize";
import { updateConversation } from "@/server/conversations/data";
import { captureUserTurn } from "@/server/conversations/capture";
import { getChatSettings } from "@/server/conversations/settings";

const MAX_CONTENT_LENGTH = 20_000;

function isUniqueViolation(message: string): boolean {
  return message.includes("duplicate key") || message.includes("23505");
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const limit = Math.min(Number(sp.get("limit") ?? 50) || 50, 200);
  const before = sp.get("before") ?? undefined;
  try {
    const page = await listMessages(session.id, id, { limit, before });
    return NextResponse.json(page);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "FORBIDDEN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (message === "NOT_FOUND") return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { content?: string; clientRequestId?: string } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const content = body.content?.trim();
  if (!content) return NextResponse.json({ error: "content is required" }, { status: 400 });
  if (content.length > MAX_CONTENT_LENGTH) {
    return NextResponse.json({ error: "content too long" }, { status: 400 });
  }

  try {
    const conversation = await getConversation(session.id, id);
    if (!conversation) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (conversation.status !== "active") {
      return NextResponse.json({ error: "Conversation is archived" }, { status: 409 });
    }

    // Idempotency: if this client_request_id already produced a user+assistant
    // pair, return the existing pair instead of duplicating.
    if (body.clientRequestId) {
      const existing = await listMessages(session.id, id, { limit: 200 });
      const priorUser = existing.items.find(
        (m) => m.role === "user" && m.clientRequestId === body.clientRequestId,
      );
      if (priorUser) {
        const priorAssistant = existing.items.find(
          (m) => m.role === "assistant" && m.parentId === priorUser.id,
        );
        return NextResponse.json({
          userMessage: priorUser,
          assistantMessage: priorAssistant ?? null,
          idempotent: true,
        });
      }
    }

    let userMessage;
    try {
      userMessage = await createUserMessage(session.id, id, {
        workspaceId: conversation.workspaceId,
        content,
        clientRequestId: body.clientRequestId,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (isUniqueViolation(message)) {
        return NextResponse.json({ error: "Duplicate request" }, { status: 409 });
      }
      throw err;
    }

    await ensureConversationTitle(session.id, id, content);

    // Collect prior context: messages before this user message, and summary.
    const priorPage = await listMessages(session.id, id, { limit: 100 });
    const priorMessages = priorPage.items.filter((m) => m.createdAt < userMessage.createdAt && m.role === "user");
    const priorUserTexts = priorMessages.map((m) => m.content);

    // Run the engine (deterministic when no provider configured).
    const result = await runChatTurn({
      userId: session.id,
      workspaceId: conversation.workspaceId,
      conversationId: id,
      content,
      clientRequestId: body.clientRequestId,
      parentMessageId: userMessage.id,
      priorUserMessages: priorUserTexts,
      conversationSummary: conversation.summary,
    });

    const assistantMessage = await createAssistantMessage(session.id, id, {
      content: result.answer.content,
      status: "completed",
      evidence: result.answer.evidence,
      context: {
        projects: result.context.projects,
        entities: result.context.entities,
        timelineEvents: result.context.timelineEvents,
        intent: result.context.analysis.intent,
      },
      tokens:
        result.answer.usage.inputTokens + result.answer.usage.outputTokens || null,
      clientRequestId: body.clientRequestId ? `${body.clientRequestId}:assistant` : null,
      parentId: userMessage.id,
    });

    // Update rolling summary.
    const newSummary = updateRollingSummary(conversation.summary, [
      { role: "user", content },
      { role: "assistant", content: result.answer.content },
    ]);
    if (newSummary !== conversation.summary) {
      try {
        await updateConversation(session.id, id, { summary: newSummary });
      } catch {
        // summary update is best-effort
      }
    }

    // Conversational memory capture (opt-in).
    try {
      const settings = await getChatSettings(session.id, conversation.workspaceId);
      if (settings.automaticMemoryCapture) {
        await captureUserTurn(session.id, conversation.workspaceId, id, userMessage, { force: false });
      }
    } catch {
      // capture is best-effort
    }

    return NextResponse.json({ userMessage, assistantMessage });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "FORBIDDEN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (message === "BUDGET_EXCEEDED") {
      return NextResponse.json(
        { error: "Workspace chat budget exceeded", code: "BUDGET_EXCEEDED" },
        { status: 429 },
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
