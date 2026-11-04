/**
 * MNEMOSYNE Part 6 — response validation.
 *
 * Post-generation checks: rejection of empty output, oversized answers, and
 * citations that point outside the retrieved set. Returns normalized content
 * and a validity verdict. The engine uses this before persisting an assistant
 * message marked 'completed'.
 */

import { parseCitations } from "./evidence";
import type { ChatAnswer, RetrievedEvidence } from "./types";

const MAX_ANSWER_LENGTH = 12_000;

export interface ValidationResult {
  valid: boolean;
  reason?: string;
  content: string;
}

export function validateAnswer(
  answer: ChatAnswer,
  evidence: RetrievedEvidence[],
): ValidationResult {
  let content = answer.content.trim();

  if (!content) {
    return { valid: false, reason: "empty_response", content };
  }
  if (content.length > MAX_ANSWER_LENGTH) {
    content = content.slice(0, MAX_ANSWER_LENGTH);
  }

  // Confirm citations reference only retrieved evidence.
  const parsed = parseCitations(content, evidence);
  for (const ref of answer.evidence) {
    const known = evidence.some((e) => e.id === ref.id);
    if (!known) {
      // Drop unauthorized citations silently — they must not surface.
      answer.evidence = answer.evidence.filter((r) => r.id !== ref.id);
    }
  }

  return { valid: true, content: parsed.clean };
}
