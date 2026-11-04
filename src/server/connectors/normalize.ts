import { createHash } from "node:crypto";
import type { NormalizedSource, ProviderId } from "@/server/connectors/types";

/**
 * Normalization helpers for universal data connectors.
 *
 * Raw provider payloads are normalized into a Unified `NormalizedSource`
 * shape here so the sync pipeline and ingestion layer never have to know
 * about provider-specific field naming.
 */

/**
 * Stable content hash over the fields that determine whether a source is a
 * new/updated document. Two sources with the same provider, external id,
 * title, content and modified-at are considered identical.
 */
export function computeContentHash(source: NormalizedSource): string {
  const parts = [
    source.provider,
    source.externalId,
    source.title ?? "",
    source.content ?? "",
    source.modifiedAt ?? "",
  ];
  return createHash("sha256").update(parts.join("\u0000")).digest("hex");
}

/**
 * Derive a short, human-friendly title for a source. Prefers an explicit
 * title; falls back to the first ~300 characters of content.
 */
export function summarizeSource(source: NormalizedSource): string {
  if (source.title && source.title.trim()) {
    return source.title.trim().slice(0, 300);
  }
  const text = (source.content ?? "").replace(/\s+/g, " ").trim();
  if (!text) {
    return "Untitled source";
  }
  return text.slice(0, 300);
}

/**
 * Normalize a raw provider payload into a `NormalizedSource`.
 * - Defaults `metadata` to `{}`.
 * - Coerces empty/whitespace-only strings to `null`.
 *
 * The `title`/`content` fields stay as-is (the pipeline decides when the
 * content is empty and should be skipped); only literal empty strings are
 * coerced so downstream checks can use `null` as "not provided".
 */
export function normalizeRaw(
  raw: {
    externalId: string;
    recordType: string;
    title?: string | null;
    content?: string | null;
    author?: string | null;
    timestamp?: string | null;
    modifiedAt?: string | null;
    url?: string | null;
    parentId?: string | null;
    threadId?: string | null;
    fileMeta?: Record<string, unknown> | null;
    metadata?: Record<string, unknown>;
  },
  provider: ProviderId,
  connectionId: string,
  workspaceId: string,
): NormalizedSource {
  const str = (v: string | null | undefined): string | null =>
    typeof v === "string" && v.trim() !== "" ? v.trim() : null;

  return {
    provider,
    connectionId,
    workspaceId,
    externalId: raw.externalId,
    recordType: raw.recordType,
    title: str(raw.title),
    content: str(raw.content),
    author: str(raw.author),
    timestamp: str(raw.timestamp),
    modifiedAt: str(raw.modifiedAt),
    url: str(raw.url),
    parentId: str(raw.parentId),
    threadId: str(raw.threadId),
    fileMeta: raw.fileMeta ?? null,
    metadata: raw.metadata ?? {},
  };
}
