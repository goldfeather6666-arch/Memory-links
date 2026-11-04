/**
 * MNEMOSYNE Part 4 — shared types for the autonomous memory intelligence layer.
 * Mirrors the intelligence schema (migrations/0003_intelligence.sql).
 */

import type { MemoryType, PrivacyClassification } from "@/db/schema";

export { MemoryType, PrivacyClassification };

// ---------------------------------------------------------------------------
// Temporal
// ---------------------------------------------------------------------------

export interface TemporalInfo {
  /** When the event/statement actually happened (event time). Null if unknown. */
  occurredAt: string | null;
  /** When the record was entered into the system (entry time). */
  createdAt: string;
  /** Validity interval. Lower bound (inclusive). Null = open. */
  validFrom: string | null;
  /** Validity interval. Upper bound (inclusive). Null = open. */
  validUntil: string | null;
  /** When a correction was last applied to this record. */
  updatedAt: string;
  /** Current version number (1 = original). */
  version: number;
}

export interface HistoricalSnapshot {
  memoryId: string;
  content: string;
  summary: string | null;
  memoryType: MemoryType;
  /** True if this record (or one of its versions) was valid at time `at`. */
  wasTrue: boolean;
  /** The version that was current at `at` (if any). */
  versionAtTime: number | null;
  /** The version that is current now. */
  currentVersion: number;
  reason: "existing" | "valid_at_time" | "not_valid_at_time";
}

// ---------------------------------------------------------------------------
// Entities & relationships
// ---------------------------------------------------------------------------

export type EntityType =
  | "person"
  | "organization"
  | "product"
  | "project"
  | "location"
  | "technology"
  | "event"
  | "concept";

export const ENTITY_TYPES: readonly EntityType[] = [
  "person",
  "organization",
  "product",
  "project",
  "location",
  "technology",
  "event",
  "concept",
];

export interface EntityRecord {
  id: string;
  workspaceId: string;
  ownerId: string;
  entityType: EntityType;
  canonicalName: string;
  confidence: number | null;
  provenance: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface EntityAliasRecord {
  id: string;
  entityId: string;
  alias: string;
  createdAt: string;
}

export type RelationshipType =
  | "works_on"
  | "owns"
  | "uses"
  | "created"
  | "related_to"
  | "depends_on"
  | "replaced_by"
  | "participated_in"
  | "decided"
  | "located_in"
  | "shares_entity";

export const RELATIONSHIP_TYPES: readonly RelationshipType[] = [
  "works_on",
  "owns",
  "uses",
  "created",
  "related_to",
  "depends_on",
  "replaced_by",
  "participated_in",
  "decided",
  "located_in",
  "shares_entity",
];

export interface EntityRelationshipRecord {
  id: string;
  sourceMemoryId: string;
  targetMemoryId: string;
  relationshipType: RelationshipType;
  strength: number | null;
  confidence: number | null;
  provenance: Record<string, unknown>;
  createdAt: string;
}

export interface NormalizedEntity {
  canonicalName: string;
  entityType: EntityType;
  aliases: string[];
  confidence: number;
}

// ---------------------------------------------------------------------------
// Contradictions
// ---------------------------------------------------------------------------

export type ContradictionCategory =
  | "genuine"
  | "temporal"
  | "context"
  | "uncertain"
  | "duplicate";

export const CONTRADICTION_CATEGORIES: readonly ContradictionCategory[] = [
  "genuine",
  "temporal",
  "context",
  "uncertain",
  "duplicate",
];

export type ContradictionStatus =
  | "unresolved"
  | "resolved_by_newer"
  | "resolved_by_user"
  | "context_dependent"
  | "dismissed";

export const CONTRADICTION_STATUSES: readonly ContradictionStatus[] = [
  "unresolved",
  "resolved_by_newer",
  "resolved_by_user",
  "context_dependent",
  "dismissed",
];

export interface ContradictionRecord {
  id: string;
  workspaceId: string;
  ownerId: string;
  memoryIdA: string;
  memoryIdB: string;
  category: ContradictionCategory;
  evidence: Record<string, unknown>;
  confidence: number | null;
  status: ContradictionStatus;
  resolutionMetadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ConflictOutput {
  memoryIdA: string;
  memoryIdB: string;
  category: ContradictionCategory;
  evidence: Record<string, unknown>;
  confidence: number;
}

export interface ConflictCandidatePair {
  a: { id: string; content: string; occurredAt: string | null; createdAt: string };
  b: { id: string; content: string; occurredAt: string | null; createdAt: string };
  sharedEntity: string;
}

// ---------------------------------------------------------------------------
// Consolidations
// ---------------------------------------------------------------------------

export type ConsolidationKind =
  | "related"
  | "repeated_fact"
  | "repeated_preference"
  | "project"
  | "event"
  | "decision"
  | "change"
  | "gap"
  | "contradiction"
  | "summary";

export const CONSOLIDATION_KINDS: readonly ConsolidationKind[] = [
  "related",
  "repeated_fact",
  "repeated_preference",
  "project",
  "event",
  "decision",
  "change",
  "gap",
  "contradiction",
  "summary",
];

export interface ConsolidationRecord {
  id: string;
  workspaceId: string;
  ownerId: string;
  kind: ConsolidationKind;
  title: string;
  summary: string;
  supportingMemoryIds: string[];
  sourceRefs: Record<string, unknown>[];
  confidence: number | null;
  status: "active" | "superseded" | "dismissed";
  meta: Record<string, unknown>;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ConsolidationGroup {
  kind: ConsolidationKind;
  title: string;
  summary: string;
  memoryIds: string[];
  confidence: number;
  meta?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Patterns
// ---------------------------------------------------------------------------

export type PatternType =
  | "frequent_project"
  | "repeated_workflow"
  | "recurring_problem"
  | "consistent_preference"
  | "frequently_referenced"
  | "repeated_decision"
  | "priority_change"
  | "general";

export const PATTERN_TYPES: readonly PatternType[] = [
  "frequent_project",
  "repeated_workflow",
  "recurring_problem",
  "consistent_preference",
  "frequently_referenced",
  "repeated_decision",
  "priority_change",
  "general",
];

export interface PatternRecord {
  id: string;
  workspaceId: string;
  ownerId: string;
  patternType: PatternType;
  description: string;
  supportingMemoryIds: string[];
  confidence: number | null;
  firstObservedAt: string;
  lastObservedAt: string;
  status: "active" | "superseded" | "dismissed";
  meta: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface PatternOutput {
  patternType: PatternType;
  description: string;
  memoryIds: string[];
  confidence: number;
}

// ---------------------------------------------------------------------------
// Suggestions
// ---------------------------------------------------------------------------

export type SuggestionType =
  | "related_memories"
  | "project_decision_changed"
  | "preference_may_be_outdated"
  | "repeated_procedure"
  | "same_project_reference"
  | "long_term_retention"
  | "general";

export const SUGGESTION_TYPES: readonly SuggestionType[] = [
  "related_memories",
  "project_decision_changed",
  "preference_may_be_outdated",
  "repeated_procedure",
  "same_project_reference",
  "long_term_retention",
  "general",
];

export type SuggestionStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "edited"
  | "dismissed"
  | "deferred";

export const SUGGESTION_STATUSES: readonly SuggestionStatus[] = [
  "pending",
  "accepted",
  "rejected",
  "edited",
  "dismissed",
  "deferred",
];

export interface SuggestionRecord {
  id: string;
  workspaceId: string;
  ownerId: string;
  suggestionType: SuggestionType;
  title: string;
  body: string;
  evidence: Record<string, unknown>;
  status: SuggestionStatus;
  targetMemoryId: string | null;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SuggestionOutput {
  suggestionType: SuggestionType;
  title: string;
  body: string;
  evidence: Record<string, unknown>;
  targetMemoryId?: string;
}

// ---------------------------------------------------------------------------
// Intelligence jobs
// ---------------------------------------------------------------------------

export type IntelligenceJobKind =
  | "consolidation"
  | "contradiction"
  | "entities"
  | "patterns"
  | "importance"
  | "suggestions"
  | "full_analysis";

export const INTELLIGENCE_JOB_KINDS: readonly IntelligenceJobKind[] = [
  "consolidation",
  "contradiction",
  "entities",
  "patterns",
  "importance",
  "suggestions",
  "full_analysis",
];

export type IntelligenceTriggerType = "manual" | "scheduled" | "incremental" | "event";

export type IntelligenceJobState =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "retryable"
  | "cancelled";

export const INTELLIGENCE_JOB_STATES: readonly IntelligenceJobState[] = [
  "pending",
  "running",
  "completed",
  "failed",
  "retryable",
  "cancelled",
];

export interface IntelligenceJobRecord {
  id: string;
  workspaceId: string;
  ownerId: string;
  kind: IntelligenceJobKind;
  triggerType: IntelligenceTriggerType;
  state: IntelligenceJobState;
  attempts: number;
  maxAttempts: number;
  runAfter: string;
  lockedBy: string | null;
  lockedAt: string | null;
  lastError: string | null;
  timeoutAfter: string;
  idempotencyKey: string | null;
  settings: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface EnqueueIntelligenceOptions {
  kind: IntelligenceJobKind;
  triggerType?: IntelligenceTriggerType;
  idempotencyKey?: string;
  settings?: Record<string, unknown>;
  runAfter?: Date;
}

// ---------------------------------------------------------------------------
// Processing settings
// ---------------------------------------------------------------------------

export interface ProcessingSettings {
  workspaceId: string;
  automaticConsolidation: boolean;
  enabledKinds: IntelligenceJobKind[];
  budgetCapTokens: number;
  modelPreference: string | null;
  createdAt: string;
  updatedAt: string;
}

export const DEFAULT_BUDGET_CAP_TOKENS = 200_000;

export const DEFAULT_ENABLED_KINDS: IntelligenceJobKind[] = [
  "consolidation",
  "contradiction",
  "entities",
  "patterns",
  "importance",
  "suggestions",
];

export interface SaveProcessingSettingsInput {
  automaticConsolidation?: boolean;
  enabledKinds?: IntelligenceJobKind[];
  budgetCapTokens?: number;
  modelPreference?: string | null;
}

// ---------------------------------------------------------------------------
// Usage / cost accounting
// ---------------------------------------------------------------------------

export interface UsageAccountingRecord {
  id: string;
  workspaceId: string;
  ownerId: string;
  jobKind: string;
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  cached: boolean;
  costEstimate: number;
  createdAt: string;
}

export interface UsageStampInput {
  workspaceId: string;
  ownerId: string;
  jobKind: string;
  model?: string | null;
  inputTokens?: number;
  outputTokens?: number;
  cached?: boolean;
  costEstimate?: number;
}

// ---------------------------------------------------------------------------
// Importance
// ---------------------------------------------------------------------------

export interface ImportanceFactor {
  name: string;
  value: number;
  weight: number;
  explanation: string;
}

export interface ImportanceExplanation {
  score: number;
  previousScore: number | null;
  factors: ImportanceFactor[];
  summary: string;
}

export type ImportanceMarker =
  | "important"
  | "pinned"
  | "temporary"
  | "long_term"
  | "exclude_from_consolidation";

export const IMPORTANCE_MARKERS: readonly ImportanceMarker[] = [
  "important",
  "pinned",
  "temporary",
  "long_term",
  "exclude_from_consolidation",
];

export interface ImportanceDecision {
  memoryId: string;
  importance: number;
  explanation: ImportanceExplanation;
}

export interface MarkMemoryInput {
  memoryId: string;
  marker: ImportanceMarker;
  active: boolean;
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export interface MemoryHealthMetrics {
  totalActiveMemories: number;
  consolidatedMemories: number;
  pendingAnalysis: number;
  unresolvedConflicts: number;
  failedProcessingJobs: number;
  totalMemories: number;
}

export interface RecentIntelligenceItem {
  id: string;
  kind: "pattern" | "consolidation" | "suggestion" | "contradiction" | "job";
  title: string;
  subtitle: string;
  createdAt: string;
  status?: string;
}

export interface IntelligenceActivitySummary {
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  retryableJobs: number;
  lastSuccessfulRun: string | null;
  lastRunAt: string | null;
  lastRunError: string | null;
}

export interface IntelligenceDashboardData {
  health: MemoryHealthMetrics;
  recent: RecentIntelligenceItem[];
  activity: IntelligenceActivitySummary;
}

// ---------------------------------------------------------------------------
// Cost / model selection
// ---------------------------------------------------------------------------

export interface ModelConfig {
  id: string;
  /** Small, cheap model used by default (small-model-first). */
  small: string;
  /** Larger model used only when justified (escalation). */
  large: string;
  /** Cost per 1M input tokens in USD (for accounting). */
  inputPer1M: number;
  /** Cost per 1M output tokens in USD (for accounting). */
  outputPer1M: number;
  /** Max input tokens allowed for this model. */
  maxInputTokens: number;
}
