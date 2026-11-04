import { getCurrentSession } from "@/server/auth/session";
import { listWorkspacesForUser } from "@/server/data/workspaces";
import { listConversations } from "@/server/conversations/data";
import { ChatApp } from "@/components/app/chat/chat-app";

export const dynamic = "force-dynamic";

export default async function ChatPage() {
  const session = await getCurrentSession();
  if (!session) return null; // app layout redirects to /signin
  const workspaces = await listWorkspacesForUser(session.id);
  if (workspaces.length === 0) return null;
  const workspaceId = workspaces[0].workspace.id;
  let initialConversations: unknown[] = [];
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
    <ChatApp workspaceId={workspaceId} initialConversations={initialConversations} />
  );
}
