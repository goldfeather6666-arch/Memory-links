import type { MemoryType, PrivacyClassification } from "@/db/schema";

export type MemoryState =
  | "pending"
  | "processing"
  | "active"
  | "needs_review"
  | "archived"
  | "deleted";

export type IngestionStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "retryable";

export type JobState =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "retryable"
  | "cancelled";

export type JobKind = "extraction" | "embedding";

export type SourceType =
  | "text"
  | "note"
  | "markdown"
  | "txt"
  | "pdf"
  | "docx"
  | "conversation"
  | "api";

export interface IngestionInput {
  workspaceId: string;
  sourceType: SourceType;
  sourceId?: string;
  title?: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface IngestionRecord {
  id: string;
  workspaceId: string;
  ownerId: string;
  sourceType: SourceType;
  sourceId: string | null;
  title: string | null;
  checksum: string;
  contentPreview: string;
  contentRef: string | null;
  sizeBytes: number;
  status: IngestionStatus;
  error: string | null;
  attempts: number;
  createdAt: string;
  processedAt: string | null;
  metadata: Record<string, unknown>;
}

export interface JobRecord {
  id: string;
  workspaceId: string;
  ownerId: string;
  kind: JobKind;
  targetId: string;
  state: JobState;
  attempts: number;
  maxAttempts: number;
  runAfter: string;
  lockedBy: string | null;
  lockedAt: string | null;
  lastError: string | null;
  timeoutAfter: string;
  createdAt: string;
  updatedAt: string;
}

export interface EntityRef {
  type: string;
  value: string;
  confidence: number;
}

export interface ExtractedFact {
  memoryType: MemoryType;
  content: string;
  summary: string;
  confidence: number;
  validFrom: string | null;
  validUntil: string | null;
  entities: EntityRef[];
}

export interface ExtractionResponse {
  memories: ExtractedFact[];
}

export interface AIProvider {
  name: string;
  extractMemories(input: { content: string; systemPrompt?: string }): Promise<ExtractionResponse>;
}

export interface EmbeddingResult {
  vectors: number[][];
  model: string;
  dimensions: number;
}

export interface EmbeddingProvider {
  name: string;
  model: string;
  dimensions: number;
  embed(texts: string[]): Promise<EmbeddingResult>;
}

export interface MemoryView {
  id: string;
  workspaceId: string;
  ownerId: string;
  memoryType: MemoryType;
  state: MemoryState;
  content: string;
  summary: string | null;
  sourceRef: string | null;
  confidence: number | null;
  importance: number;
  validFrom: string | null;
  validUntil: string | null;
  privacyClassification: PrivacyClassification;
  metadata: Record<string, unknown>;
  version: number;
  embeddingModel: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MemoryVersionView {
  id: string;
  memoryId: string;
  version: number;
  content: string;
  summary: string | null;
  memoryType: MemoryType;
  confidence: number | null;
  metadata: Record<string, unknown>;
  changeReason: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface DuplicateDecision {
  outcome: "new" | "duplicate" | "update" | "conflict";
  existingMemoryId?: string;
  reason: string;
  similarity?: number;
}

export interface RelevanceResult extends MemoryView {
  relevance: number;
}

export type RecallMethod = "keyword" | "semantic" | "hybrid";

export interface RecallOptions {
  workspaceId: string;
  query?: string;
  method?: RecallMethod;
  memoryTypes?: MemoryType[];
  states?: MemoryState[];
  sourceRef?: string;
  from?: string;
  to?: string;
  minConfidence?: number;
  privacyClassifications?: PrivacyClassification[];
  limit?: number;
  offset?: number;
}

export interface RecallResult {
  items: RelevanceResult[];
  total: number;
  method: RecallMethod;
}
