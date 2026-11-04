/**
 * Engine-wide constants and defaults. Centralized so timeouts, size limits,
 * concurrency and backoff are tunable from one place and overridable via env
 * (see src/lib/env.ts for the validated environment).
 */

export const INGESTION_MAX_BYTES = Number(process.env.INGESTION_MAX_BYTES ?? 500_000);

export const JOB_CONCURRENCY = Number(process.env.JOB_CONCURRENCY ?? 3);
export const JOB_TIMEOUT_MS = Number(process.env.JOB_TIMEOUT_MS ?? 60_000);
export const JOB_MAX_ATTEMPTS = Number(process.env.JOB_MAX_ATTEMPTS ?? 5);

/** Base delay in ms for retry backoff (attempt n => 2^(n-1) * base). */
export const JOB_BACKOFF_BASE_MS = Number(process.env.JOB_BACKOFF_BASE_MS ?? 2_000);

export const MEMORY_TYPES = ["episodic", "semantic", "procedural", "associative"] as const;

export const MEMORY_STATES = [
  "pending",
  "processing",
  "active",
  "needs_review",
  "archived",
  "deleted",
] as const;

export const INGESTION_STATUSES = [
  "pending",
  "processing",
  "completed",
  "failed",
  "retryable",
] as const;

export const JOB_STATES = [
  "pending",
  "running",
  "completed",
  "failed",
  "retryable",
  "cancelled",
] as const;

export const SOURCE_TYPES = [
  "text",
  "note",
  "markdown",
  "txt",
  "pdf",
  "docx",
  "conversation",
  "api",
] as const;

export const MAX_MEMORIES_PER_EXTRACTION = 50;
export const MAX_ENTITY_VALUE_LENGTH = 200;
export const MAX_ENTITY_TYPE_LENGTH = 60;
export const MAX_EXTRACTED_CONTENT_LENGTH = 5_000;
export const MAX_EXTRACTED_SUMMARY_LENGTH = 1_000;

export const RECALL_LIMIT_DEFAULT = 20;
export const RECALL_LIMIT_MAX = 100;

export const PAGE_SIZE_DEFAULT = 20;
export const PAGE_SIZE_MAX = 100;
