import { createHash } from "crypto";

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function contentChecksum(content: string): string {
  return sha256(content);
}

/**
 * Normalize text for fuzzy duplicate comparison: lowercase, collapse
 * whitespace, strip punctuation. Used for normalized-text dedup.
 */
export function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function truncate(input: string, max: number): string {
  if (input.length <= max) return input;
  return `${input.slice(0, max).trimEnd()}…`;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  if (denom === 0) return 0;
  return dot / denom;
}

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** Idempotency key for an ingestion input within a workspace. */
export function ingestionKey(
  workspaceId: string,
  sourceType: string,
  sourceId: string | undefined,
  checksum: string,
): string {
  return `${workspaceId}:${sourceType}:${sourceId ?? "none"}:${checksum}`;
}
