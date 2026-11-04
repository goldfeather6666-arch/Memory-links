import { createHmac, timingSafeEqual } from "node:crypto";
import type { ProviderId } from "@/server/connectors/types";

/**
 * Provider webhook verification + event mapping.
 *
 * Verification implements real HMAC-SHA256 checks for GitHub and Slack.
 * Other providers are not yet integrated: when the secret is empty we accept
 * (nothing to verify) and otherwise refuse, documented as not implemented.
 */

function safeDigestEqual(left: Buffer, right: Buffer): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

function hexDigest(secret: string, message: string): Buffer {
  return Buffer.from(createHmac("sha256", secret).update(message).digest("hex"), "utf8");
}

/**
 * Verify a provider webhook signature.
 *
 * - GitHub: `x-hub-signature-256` value `sha256=<hex>`, HMAC-SHA256 over the
 *   raw body.
 * - Slack: `X-Slack-Signature` value `v0=<hex>`, HMAC-SHA256 over
 *   `v0:<timestamp>:<body>` (timestamp parsed from the body's `event_time`
 *   when present).
 * - Others: true only when the secret is empty (documented not implemented).
 */
export function verifyProviderWebhook(
  provider: ProviderId,
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
): boolean {
  if (!secret) {
    return true;
  }
  if (!signatureHeader) {
    return false;
  }

  if (provider === "github") {
    const prefix = "sha256=";
    if (!signatureHeader.startsWith(prefix)) {
      return false;
    }
    const provided = Buffer.from(signatureHeader.slice(prefix.length), "utf8");
    return safeDigestEqual(hexDigest(secret, rawBody), provided);
  }

  if (provider === "slack") {
    const prefix = "v0=";
    if (!signatureHeader.startsWith(prefix)) {
      return false;
    }
    const provided = Buffer.from(signatureHeader.slice(prefix.length), "utf8");
    const timestamp = extractSlackTimestamp(rawBody);
    if (!timestamp) {
      return false;
    }
    const message = `v0:${timestamp}:${rawBody}`;
    return safeDigestEqual(hexDigest(secret, message), provided);
  }

  // Other providers: webhook verification is not implemented.
  return false;
}

function extractSlackTimestamp(rawBody: string): string | null {
  try {
    const parsed = JSON.parse(rawBody) as { event_time?: number };
    if (typeof parsed.event_time === "number" && Number.isFinite(parsed.event_time)) {
      return String(Math.trunc(parsed.event_time));
    }
  } catch {
    // Not JSON — fall through.
  }
  return null;
}

export interface WebhookEventMap {
  trigger: "scheduled" | "webhook";
  connectionExternalId?: string;
}

/**
 * Map a provider webhook payload to a sync trigger. Counter payload is never
 * trusted as authoritative; this only decides whether to enqueue a bounded
 * sync job.
 */
export function mapWebhookEvent(
  provider: ProviderId,
  payload: unknown,
): WebhookEventMap | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const rec = payload as Record<string, unknown>;

  if (provider === "github") {
    // Push or issue/PR events trigger a webhook sync.
    if ("ref" in rec || "issue" in rec || "pull_request" in rec) {
      const connectionExternalId = extractGithubRepositoryId(rec);
      return { trigger: "webhook", connectionExternalId };
    }
    return null;
  }

  if (provider === "slack") {
    // Slack events arrive as a payload with an `event` object or a top-level
    // `type` of "message".
    const eventType =
      typeof rec.type === "string"
        ? rec.type
        : typeof rec.event === "object" && rec.event !== null
          ? (rec.event as Record<string, unknown>).type
          : undefined;
    if (eventType === "message") {
      const connectionExternalId =
        typeof rec.team_id === "string" ? rec.team_id : undefined;
      return { trigger: "webhook", connectionExternalId };
    }
    return null;
  }

  return null;
}

function extractGithubRepositoryId(rec: Record<string, unknown>): string | undefined {
  const repo = rec.repository;
  if (repo && typeof repo === "object") {
    const r = repo as Record<string, unknown>;
    if (typeof r.id === "number") {
      return String(r.id);
    }
    if (typeof r.full_name === "string") {
      return r.full_name;
    }
  }
  return undefined;
}
