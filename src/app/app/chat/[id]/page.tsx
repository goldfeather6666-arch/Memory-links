import { getCurrentSession } from "@/server/auth/session";
import { listWorkspacesForUser } from "@/server/data/workspaces";
import { getConversation, listMessages } from "@/server/conversations/data";
import { notFound } from "next/navigation";
import { ChatApp } from "@/components/app/chat/chat-app";
import type { ConversationRecord, MessageRecord } from "@/server/conversations/types";

export const dynamic = "force-dynamic";

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getCurrentSession();
  if (!session) return null;
  const workspaces = await listWorkspacesForUser(session.id);
  if (workspaces.length === 0) return null;
  const workspaceId = workspaces[0].workspace.id;

  let conversation: ConversationRecord | null = null;
  let messages: MessageRecord[] = [];
  let list: ConversationRecord[] = [];
  try {
    conversation = await getConversation(session.id, id);
    if (!conversation) notFound();
    const page = await listMessages(session.id, id, { limit: 100 });
    messages = page.items;
    const all = await import("@/server/conversations/data").then((m) =>
      m.listConversations(session.id, workspaceId, { status: "active", limit: 100 }),
    );
    list = all.items.filter((c) => c.id !== id);
  } catch {
    // fall through
  }

  return (
    <ChatApp
      workspaceId={workspaceId}
      initialConversations={list}
      initialConversation={conversation}
      initialMessages={messages}
    />
  );
}
