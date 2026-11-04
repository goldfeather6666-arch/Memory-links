/**
 * MNEMOSYNE Part 6 — citation + evidence generation.
 *
 * Every factual claim in an answer should trace back to evidence retrieved from
 * the user's own memories. We validate citations against the retrieved set,
 * ensure the model cannot cite evidence that was never retrieved, and label
 * each piece by provenance (directly stated / summarized / inference /
 * uncertain).
 */

import type { EvidenceRef, EvidenceProvenance } from "@/server/conversations/types";
import type { RetrievedEvidence } from "./types";

const MAX_QUOTE = 220;

export function toEvidenceRef(ev: RetrievedEvidence, provenance?: EvidenceProvenance): EvidenceRef {
  return {
    id: ev.id,
    kind: "memory",
    type: ev.type,
    label: ev.label,
    summary: ev.summary,
    confidence: ev.confidence,
    importance: ev.importance,
    createdAt: ev.createdAt,
    quote: ev.quote ? ev.quote.slice(0, MAX_QUOTE) : null,
    provenance: provenance ?? ev.provenance,
  };
}

/**
 * Extract bracketed citation markers like [1], [2] from generated text and map
 * them to the retrieved evidence set. Unmapped or out-of-range markers are
 * dropped (never fabricated). Returns clean text + cited evidence.
 */
export function parseCitations(
  content: string,
  evidence: RetrievedEvidence[],
): { clean: string; cited: EvidenceRef[] } {
  const cited: EvidenceRef[] = [];
  const usedIndexes = new Set<number>();
  const clean = content.replace(/\[(\d{1,2})\]/g, (_m, raw) => {
    const idx = Number(raw) - 1;
    if (idx >= 0 && idx < evidence.length) {
      usedIndexes.add(idx);
      return `[${raw}]`;
    }
    return "";
  });
  for (const idx of Array.from(usedIndexes).sort((a, b) => a - b)) {
    cited.push(toEvidenceRef(evidence[idx]));
  }
  return { clean, cited };
}

/**
 * When the model produced no citations but evidence exists, attach the top-N
 * retrieved memories as supporting sources (labelled "summarized"), so the
 * user can still open them — but never claim a direct quotation was used.
 */
export function attachSupportingEvidence(
  content: string,
  evidence: RetrievedEvidence[],
  limit = 6,
): { clean: string; cited: EvidenceRef[] } {
  const cited = evidence
    .slice(0, limit)
    .map((ev) => toEvidenceRef(ev, "summarized"));
  return { clean: content, cited };
}

export function hasEvidence(evidence: RetrievedEvidence[]): boolean {
  return evidence.length > 0;
}
