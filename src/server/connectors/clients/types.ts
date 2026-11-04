/**
 * MNEMOSYNE Part 8 — connector provider adapter contracts and shared helpers.
 *
 * This file defines the fixed adapter interface that every provider adapter in
 * this directory implements. It also centralises the small HTTP/time/error
 * helpers so every adapter reports failures consistently and *never* logs
 * access tokens, refresh tokens or other secrets.
 *
 * The core connector types (ProviderId, NormalizedSource) live in
 * `@/server/connectors/types` (created in parallel). The adapters map provider
 * responses onto the NormalizedSource shape derived from the `connection_sources`
 * table in migrations/0008_connectors.sql.
 */

import type { NormalizedSource, ProviderId } from "@/server/connectors/types";

/** Parameters for a single page of a sync/list request. */
export interface FetchPageParams {
  /** Provider access token (OAuth providers). For non-OAuth adapters (RSS)
   * this may carry the resource identifier, see the RSS adapter. */
  accessToken: string;
  /** Provider cursor / continuation token. For incremental adapters this may
   * carry the last-sync timestamp (ISO) instead of a page token. */
  cursor?: string | null;
  /** Maximum number of items to return for this page. Adapters cap this. */
  limit?: number;
  /** Optional set of selected resources (e.g. site for Jira, channel ids for
   * Slack, feed URL for RSS). */
  resourceIds?: string[];
}

/** Result of a single page of a sync/list request. */
export interface FetchPageResult {
  items: NormalizedSource[];
  /** Cursor to pass to the next call; null/undefined when this is the last page. */
  nextCursor?: string | null;
  /** True when there are no further pages. */
  done: boolean;
}

/** Minimal account identity resolved from an access token. */
export interface AccountIdentity {
  id: string;
  name: string;
}

/**
 * Contract implemented by every provider adapter. `fetchChanges` is optional:
 * it is provided only when the provider exposes a native incremental/change
 * mechanism that the adapter can drive from the fixed parameters.
 */
export interface ConnectorAdapter {
  provider: ProviderId;
  resolveAccount(accessToken: string): Promise<AccountIdentity>;
  fetchInitial(params: FetchPageParams): Promise<FetchPageResult>;
  fetchChanges?(params: FetchPageParams): Promise<FetchPageResult>;
}

/** Raised for any non-2xx provider response. Carries provider + HTTP status
 * only — never token material or response bodies that could leak secrets. */
export class ProviderHttpError extends Error {
  constructor(
    public provider: ProviderId,
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ProviderHttpError";
  }
}

/**
 * Reads a fetch `Response` and parses its JSON body. Throws ProviderHttpError
 * on non-2xx status (without including the body, which could contain tokens/g
 * on a malformed JSON body.
 */
export async function fetchJson(res: Response, provider: ProviderId): Promise<unknown> {
  const text = await res.text().catch(() => "");
  if (!res.ok) {
    throw new ProviderHttpError(provider, res.status, `${provider} returned HTTP ${res.status}`);
  }
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new ProviderHttpError(provider, res.status, `${provider} returned a non-JSON response`);
  }
}

/** Coerces an arbitrary value to an ISO-8601 string or null when invalid. */
export function coerceTimestamp(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (typeof value !== "string" || value.length === 0) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Hard cap on items per page for all adapters. */
export const MAX_PAGE_SIZE = 100;

/** Hard cap on pages fetched per sync for all adapters. */
export const MAX_PAGES = 10;

/** Normalises a requested limit to [1, MAX_PAGE_SIZE]. */
export function pageLimit(limit?: number): number {
  if (typeof limit === "number" && Number.isFinite(limit) && limit > 0) {
    return Math.min(Math.floor(limit), MAX_PAGE_SIZE);
  }
  return MAX_PAGE_SIZE;
}

/** Builds a Bearer authorization header object. */
export function bearerAuth(accessToken: string): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}` };
}

/** Decodes the five XML entities we are most likely to meet in feed text. */
export function decodeXmlEntities(input: string): string {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

/** Strips CDATA wrappers if present. */
export function stripCData(input: string): string {
  return input.replace(/^\s*<!\[CDATA\[/, "").replace(/\]\]>\s*$/, "");
}

export type { NormalizedSource, ProviderId };
