/**
 * MNEMOSYNE Part 6 — conversational memory capture.
 *
 * Lets the user (opt-in globally, or explicitly per message) save user-stated
 * facts from a conversation into the memory ingestion pipeline. Only user
 * statements are candidates — assistant content is never captured. Dedupe is
 * delegated to the ingestion layer (source+checksum idempotency).
 */

import { createIngestion, requireValidIngestionInput } from "@/server/memory/ingestion";
import { getChatSettings } from "@/server/conversations/settings";
import { userHasWorkspaceAccess } from "@/server/data/workspaces";
import type { MessageRecord } from "@/server/conversations/types";

const MAX_CAPTURE_LENGTH = 20_000;

/**
 * Capture a user turn as a memory, routed through normal ingestion. Returns
 * the ingestion record, or null when there is nothing capturable.
 */
export async function captureUserTurn(
  userId: string,
  workspaceId: string,
  conversationId: string,
  userMessage: MessageRecord,
  opts: { force?: boolean } = {},
): Promise<{ id: string; status: string } | null> {
  if (!(await userHasWorkspaceAccess(userId, workspaceId))) {
    throw new Error("FORBIDDEN");
  }

  const content = userMessage.content.trim();
  if (!content) return null;
  if (content.length > MAX_CAPTURE_LENGTH) return null;

  if (!opts.force) {
    const settings = await getChatSettings(userId, workspaceId);
    if (!settings.automaticMemoryCapture) return null;
  }

  requireValidIngestionInput({
    workspaceId,
    sourceType: "conversation",
    sourceId: userMessage.id,
    title: `Conversation message (${userMessage.id})`,
    content,
    metadata: { conversationId },
  });

  const record = await createIngestion(userId, {
    workspaceId,
    sourceType: "conversation",
    sourceId: userMessage.id,
    title: `Conversation message (${userMessage.id})`,
    content,
    metadata: { conversationId },
  });

  return { id: record.id, status: record.status };
}
