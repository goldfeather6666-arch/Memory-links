import { getCurrentSession } from "@/server/auth/session";
import { listWorkspacesForUser } from "@/server/data/workspaces";
import { listConversations } from "@/server/conversations/data";
import { ChatApp } from "@/components/app/chat/chat-app";
import type { ConversationRecord } from "@/server/conversations/types";
import { DemoBanner } from "@/components/app/demo-banner";

export const dynamic = "force-dynamic";

export default async function ChatPage() {
  const session = await getCurrentSession();
  if (!session) return null; // app layout redirects to /signin
  const workspaces = await listWorkspacesForUser(session.id);
  if (workspaces.length === 0) return null;
  const workspaceId = workspaces[0].workspace.id;
  const isDemo = workspaces[0].workspace.settings?.is_demo === true;
  let initialConversations: ConversationRecord[] = [];
  try {
    const result = await listConversations(session.id, workspaceId, {
      status: "active",
      limit: 100,
    });
    initialConversations = result.items;
  } catch {
    // conversation list is best-effort
  }
  return (
    <>
      {isDemo && <DemoBanner />}
      <ChatApp workspaceId={workspaceId} initialConversations={initialConversations} />
    </>
  );
}
