import { INGESTION_MAX_BYTES } from "@/server/memory/constants";
import { ValidationError } from "@/server/memory/errors";
import { truncate } from "@/server/memory/util";

/**
 * Content normalization before ingestion/extraction. Treats all content as
 * untrusted data: it strips control characters, enforces a size ceiling, and
 * produces a short preview for storage. No HTML/markup interpretation is done
 * (imported content is never executed).
 */

export interface PreprocessedContent {
  content: string;
  preview: string;
  sizeBytes: number;
}

export function preprocessContent(raw: string): PreprocessedContent {
  if (typeof raw !== "string" || raw.length === 0) {
    throw new ValidationError("Content is empty.");
  }

  // Strip NUL and control characters except newlines/tabs.
  const cleaned = raw.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");

  const sizeBytes = Buffer.byteLength(cleaned, "utf8");
  if (sizeBytes > INGESTION_MAX_BYTES) {
    throw new ValidationError(
      `Content exceeds the maximum size of ${INGESTION_MAX_BYTES} bytes.`,
    );
  }

  const content = cleaned.trim();
  if (content.length === 0) {
    throw new ValidationError("Content is empty after normalization.");
  }

  return {
    content,
    preview: truncate(content, 800),
    sizeBytes,
  };
}

export function isSupportedSourceType(value: string): value is "text" | "note" | "markdown" | "txt" | "pdf" | "docx" | "conversation" | "api" {
  return ["text", "note", "markdown", "txt", "pdf", "docx", "conversation", "api"].includes(value);
}
