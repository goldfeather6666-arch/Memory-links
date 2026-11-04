/**
 * MNEMOSYNE Part 6 — shared types for the conversational intelligence layer
 * ("Ask Your Past"). Mirrors migrations/0006_chat.sql.
 */

export type ConversationStatus = "active" | "archived";

export type MessageRole = "user" | "assistant" | "system";

export type MessageStatus =
  | "pending"
  | "streaming"
  | "completed"
  | "failed"
  | "retryable"
  | "cancelled";

export type EvidenceProvenance =
  | "direct"
  | "summarized"
  | "inference"
  | "uncertain";

export interface EvidenceRef {
  /** Memory id (or source id for non-memory evidence). */
  id: string;
  kind: "memory" | "document" | "project" | "event" | "source";
  /** memory_type / entity type etc. */
  type: string;
  label: string;
  summary: string | null;
  confidence: number | null;
  importance: number;
  createdAt: string;
  /** Supporting excerpt from the memory (may be null). */
  quote: string | null;
  /** How this evidence supports the answer (direct = explicitly stated). */
  provenance: EvidenceProvenance;
}

export interface MessageRecord {
  id: string;
  conversationId: string;
  workspaceId: string;
  ownerId: string;
  role: MessageRole;
  content: string;
  tokens: number | null;
  evidence: EvidenceRef[];
  /** Retrieval context that grounded this message (projects/entities/timeline). */
  context: Record<string, unknown>;
  status: MessageStatus;
  error: string | null;
  clientRequestId: string | null;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationRecord {
  id: string;
  workspaceId: string;
  ownerId: string;
  title: string;
  summary: string | null;
  status: ConversationStatus;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string | null;
  messageCount: number;
}

export interface ChatSettings {
  workspaceId: string;
  automaticMemoryCapture: boolean;
  modelPreference: string | null;
  budgetCapTokens: number;
  allowStreaming: boolean;
}

export interface SaveChatSettingsInput {
  automaticMemoryCapture?: boolean;
  modelPreference?: string | null;
  budgetCapTokens?: number;
  allowStreaming?: boolean;
}

export interface NewConversationInput {
  workspaceId: string;
  title?: string;
}

export interface UpdateConversationInput {
  title?: string;
  status?: ConversationStatus;
  summary?: string | null;
}

export interface MessagePage {
  items: MessageRecord[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SendMessageInput {
  workspaceId: string;
  content: string;
  clientRequestId?: string;
  sourceType?: "text" | "note" | "markdown" | "conversation";
}
