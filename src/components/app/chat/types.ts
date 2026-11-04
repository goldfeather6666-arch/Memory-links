/** Client-side mirror of the chat API shapes (avoid importing server modules). */

export interface ChatConversation {
  id: string;
  workspaceId: string;
  ownerId: string;
  title: string;
  summary: string | null;
  status: "active" | "archived";
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string | null;
  messageCount: number;
}

export interface ChatEvidence {
  id: string;
  kind: "memory" | "document" | "project" | "event" | "source";
  type: string;
  label: string;
  summary: string | null;
  confidence: number | null;
  importance: number;
  createdAt: string;
  quote: string | null;
  provenance: "direct" | "summarized" | "inference" | "uncertain";
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  workspaceId: string;
  ownerId: string;
  role: "user" | "assistant" | "system";
  content: string;
  tokens: number | null;
  evidence: ChatEvidence[];
  context: Record<string, unknown>;
  status: "pending" | "streaming" | "completed" | "failed" | "retryable" | "cancelled";
  error: string | null;
  clientRequestId: string | null;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChatSettings {
  workspaceId: string;
  automaticMemoryCapture: boolean;
  modelPreference: string | null;
  budgetCapTokens: number;
  allowStreaming: boolean;
}

export interface ChatUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface ChatSettingsResponse {
  settings: ChatSettings;
  usage: ChatUsage;
  keys: { provider: string; fingerprint: string; model: string | null }[];
  byokEnabled: boolean;
}

export interface ContextMeta {
  projects?: { id: string; label: string }[];
  entities?: { id: string; label: string; type: string }[];
  timelineEvents?: { id: string; label: string; at: string | null }[];
  intent?: string;
}
