/**
 * MNEMOSYNE Part 6 — chat engine shared types.
 */

import type { EvidenceProvenance, EvidenceRef, MessageRole } from "@/server/conversations/types";

export type { EvidenceProvenance, EvidenceRef };

export type QueryIntent =
  | "factual"
  | "historical"
  | "temporal_comparison"
  | "project_summary"
  | "preference"
  | "relationship"
  | "procedure"
  | "general"
  | "multi_step";

export type AnswerFormat =
  | "text"
  | "list"
  | "timeline"
  | "summary"
  | "comparison"
  | "procedure";

export interface TimeRef {
  kind: "absolute" | "relative" | "range";
  value?: string;
  start?: string;
  end?: string;
  raw: string;
}

export interface QueryAnalysis {
  intent: QueryIntent;
  entities: string[];
  timeRefs: TimeRef[];
  projects: string[];
  categories: string[];
  answerFormat: AnswerFormat;
  keywords: string[];
  requiresDeepReasoning: boolean;
  requiresClarification: boolean;
  clarificationQuestion?: string;
  inputTokens: number;
}

export interface RetrievedEvidence {
  id: string;
  kind: "memory";
  type: string;
  label: string;
  summary: string | null;
  confidence: number | null;
  importance: number;
  createdAt: string;
  quote: string | null;
  content: string;
  validFrom: string | null;
  validUntil: string | null;
  occurredAt: string | null;
  relevance: number;
  provenance: EvidenceProvenance;
}

export interface ContextProject {
  id: string;
  label: string;
}

export interface ContextEntity {
  id: string;
  label: string;
  type: string;
}

export interface ContextTimelineEvent {
  id: string;
  label: string;
  at: string | null;
}

export interface ChatContextPackage {
  evidence: RetrievedEvidence[];
  projects: ContextProject[];
  entities: ContextEntity[];
  timelineEvents: ContextTimelineEvent[];
  conversationSummary: string | null;
  recentMessages: { role: MessageRole; content: string }[];
  analysis: QueryAnalysis;
}

export interface ChatAnswer {
  content: string;
  evidence: EvidenceRef[];
  uncertainty: boolean;
  generatedBy: "llm" | "deterministic";
  model: string | null;
  usage: { inputTokens: number; outputTokens: number };
}

export interface ChatRunResult {
  answer: ChatAnswer;
  context: ChatContextPackage;
}

export interface ChatRunOptions {
  workspaceId: string;
  conversationId: string;
  content: string;
  clientRequestId?: string;
  parentMessageId?: string;
  priorUserMessages: string[];
  conversationSummary: string | null;
}
