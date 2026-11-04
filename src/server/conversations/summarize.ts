/**
 * MNEMOSYNE Part 6 — conversation summarization + rolling context.
 *
 * We never send the whole conversation to the model. Instead we maintain a
 * rolling summary plus only the most recent messages. This keeps context
 * bounded and cost predictable.
 */

import { estimateTokens } from "@/server/intelligence/cost";

const MAX_SUMMARY_TOKENS = 400;
const MAX_RECENT_MESSAGES = 6;

/** Truncate a summary to a token budget (approximate, 4 chars/token). */
export function trimSummary(summary: string, maxTokens = MAX_SUMMARY_TOKENS): string {
  if (!summary) return "";
  const maxChars = maxTokens * 4;
  if (summary.length <= maxChars) return summary;
  return summary.slice(0, maxChars - 1).trimEnd() + "…";
}

/** Extend/refresh a rolling summary from recent exchanges. */
export function updateRollingSummary(
  previous: string | null,
  newMessages: { role: string; content: string }[],
): string {
  const current = previous ?? "";
  const additions = newMessages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content.trim()}`)
    .filter(Boolean)
    .slice(-6);
  if (!additions.length) return current;
  const joined = [current.trim(), additions.join("\n")]
    .filter(Boolean)
    .join("\n");
  return trimSummary(joined);
}

export interface ConversationContext {
  summary: string | null;
  recentMessages: { role: string; content: string }[];
  approximateTokens: number;
}

/** Build the bounded context sent to the model. */
export function buildConversationContext(
  summary: string | null,
  allMessages: { role: string; content: string }[],
): ConversationContext {
  const recent = allMessages.slice(-MAX_RECENT_MESSAGES);
  const s = trimSummary(summary ?? "");
  let tokens = estimateTokens(s);
  for (const m of recent) tokens += estimateTokens(m.content);
  return {
    summary: s || null,
    recentMessages: recent,
    approximateTokens: tokens,
  };
}
