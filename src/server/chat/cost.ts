/**
 * MNEMOSYNE Part 6 — chat-specific cost controls.
 *
 * Reuses the intelligence cost layer (recordUsage, selection) for per-workspace
 * chat budget enforcement and usage accounting. All checks are tenant-scoped.
 */

import { queryTenant } from "@/db/client";
import { userHasWorkspaceAccess } from "@/server/data/workspaces";
import { getChatSettings } from "@/server/conversations/settings";
import { recordUsage, getWorkspaceUsage } from "@/server/intelligence/cost";
import type { ChatAnswer } from "./types";

/** Enforce the per-workspace chat budget against a new assistant message. */
export async function canRunChatQuery(
  userId: string,
  workspaceId: string,
  estimatedInputTokens: number,
): Promise<{ allowed: boolean; headroom: number }> {
  const settings = await getChatSettings(userId, workspaceId);
  const cap = settings.budgetCapTokens;
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const used = await getWorkspaceUsage(userId, workspaceId, { since });
  const totalTokens = used.inputTokens + used.outputTokens;
  const headroom = Math.max(0, cap - totalTokens);
  return { allowed: estimatedInputTokens <= headroom, headroom };
}

export async function stampChatUsage(
  userId: string,
  workspaceId: string,
  answer: ChatAnswer,
  kind = "chat",
): Promise<void> {
  await recordUsage({
    workspaceId,
    ownerId: userId,
    jobKind: kind,
    model: answer.model,
    inputTokens: answer.usage.inputTokens,
    outputTokens: answer.usage.outputTokens,
    costEstimate: 0,
  });
}

export async function getChatUsage(
  userId: string,
  workspaceId: string,
): Promise<{ inputTokens: number; outputTokens: number }> {
  if (!(await userHasWorkspaceAccess(userId, workspaceId))) {
    throw new Error("FORBIDDEN");
  }
  const rows = await queryTenant<{ input: string; output: string }>(
    userId,
    `SELECT COALESCE(SUM(input_tokens),0)::text AS input,
            COALESCE(SUM(output_tokens),0)::text AS output
       FROM usage_accounting WHERE workspace_id = $1 AND job_kind IN ('chat','chat_memory')`,
    [workspaceId],
  );
  return {
    inputTokens: Number(rows[0]?.input ?? 0),
    outputTokens: Number(rows[0]?.output ?? 0),
  };
}
