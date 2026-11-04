/**
 * MNEMOSYNE Part 6 — chat engine orchestrator.
 *
 * Performs: authorization → budget gate → query analysis → retrieval →
 * provider resolution → grounded answer generation → validation. Returns a
 * ChatRunResult. Streaming/cancellation/regeneration are handled by the API
 * layer on top of this; the engine itself is stateless per run.
 */

import { userHasWorkspaceAccess } from "@/server/data/workspaces";
import { resolveChatProvider } from "@/server/chat/providers";
import { retrieveContext } from "@/server/chat/retrieval";
import { generateAnswer } from "@/server/chat/answer";
import { validateAnswer } from "@/server/chat/validate";
import { canRunChatQuery, stampChatUsage } from "@/server/chat/cost";
import { getChatSettings } from "@/server/conversations/settings";
import type { ChatRunOptions, ChatRunResult } from "@/server/chat/types";

/**
 * Run the full chat pipeline for a single user turn. Deterministic when no
 * chat provider is configured.
 */
export async function runChatTurn(opts: ChatRunOptions): Promise<ChatRunResult> {
  const { userId, workspaceId } = opts;

  if (!(await userHasWorkspaceAccess(userId, workspaceId))) {
    throw new Error("FORBIDDEN");
  }

  // Budget gate before any model call.
  const budget = await canRunChatQuery(userId, workspaceId, Math.max(64, Math.round(opts.content.length / 4)));
  if (!budget.allowed) {
    throw new Error("BUDGET_EXCEEDED");
  }

  // Retrieval first (never requires a model).
  const { context } = await retrieveContext({
    userId,
    workspaceId,
    query: opts.content,
    priorUserMessages: opts.priorUserMessages,
    conversationSummary: opts.conversationSummary,
  });

  let modelPreference: string | null = null;
  try {
    const settings = await getChatSettings(userId, workspaceId);
    modelPreference = settings.modelPreference;
  } catch {
    // settings read is best-effort
  }

  const resolved = await resolveChatProvider(userId, workspaceId, modelPreference);

  const answer = await generateAnswer({
    ctx: context,
    provider: resolved.provider,
    model: resolved.configuredModel,
    maxTokens: 700,
  });

  const validated = validateAnswer(answer, context.evidence);
  if (!validated.valid) {
    throw new Error("INVALID_ANSWER");
  }
  answer.content = validated.content;

  await stampChatUsage(userId, workspaceId, answer);

  return { answer, context };
}
