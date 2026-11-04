/**
 * MNEMOSYNE Part 8 — Notion provider adapter.
 *
 * Lists pages via the /v1/search endpoint (body pagination with
 * start_cursor). Titles are extracted from the first `title`-type property;
 * missing titles fall back to "Untitled".
 */

import {
  bearerAuth,
  coerceTimestamp,
  fetchJson,
  pageLimit,
} from "./types";
import type {
  AccountIdentity,
  ConnectorAdapter,
  FetchPageParams,
  FetchPageResult,
  RawSource,
} from "./types";

const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

function notionHeaders(accessToken: string): Record<string, string> {
  return {
    ...bearerAuth(accessToken),
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json",
  };
}

function pageTitle(page: Record<string, unknown>): string | null {
  const properties = page.properties;
  if (!properties || typeof properties !== "object") return null;
  for (const value of Object.values(properties)) {
    const prop = value as { type?: unknown; title?: unknown };
    if (prop.type === "title" && Array.isArray(prop.title)) {
      const text = (prop.title as { plain_text?: unknown }[])
        .map((t) => (typeof t.plain_text === "string" ? t.plain_text : ""))
        .join("")
        .trim();
      if (text) return text;
    }
  }
  return null;
}

function toPageSource(page: Record<string, unknown>): RawSource {
  const title = pageTitle(page);
  return {
    externalId: typeof page.id === "string" ? page.id : String(page.id ?? ""),
    recordType: "page",
    title: title ?? "Untitled",
    url: typeof page.url === "string" ? page.url : null,
    modifiedAt: coerceTimestamp(page.last_edited_time),
    timestamp: coerceTimestamp(page.created_time),
    metadata: {
      parent: page.parent ?? null,
      archived: page.archived === true,
    },
  };
}

async function notionAccount(accessToken: string): Promise<AccountIdentity> {
  const res = await fetch(`${NOTION_API}/users/me`, {
    headers: notionHeaders(accessToken),
  });
  const data = (await fetchJson(res, "notion")) as { id?: unknown; name?: unknown };
  return {
    id: typeof data.id === "string" ? data.id : String(data.id ?? ""),
    name: typeof data.name === "string" ? data.name : String(data.name ?? ""),
  };
}

export const notionAdapter: ConnectorAdapter = {
  provider: "notion",
  async resolveAccount(accessToken: string): Promise<AccountIdentity> {
    return notionAccount(accessToken);
  },
  async fetchInitial(params: FetchPageParams): Promise<FetchPageResult> {
    const body: Record<string, unknown> = {
      filter: { value: "page", property: "object" },
      page_size: pageLimit(params.limit),
    };
    if (typeof params.cursor === "string" && params.cursor) {
      body.start_cursor = params.cursor;
    }

    const res = await fetch(`${NOTION_API}/search`, {
      method: "POST",
      headers: notionHeaders(params.accessToken),
      body: JSON.stringify(body),
    });
    const data = (await fetchJson(res, "notion")) as {
      results?: Record<string, unknown>[];
      has_more?: boolean;
      next_cursor?: string | null;
    };
    const items = Array.isArray(data.results) ? data.results.map(toPageSource) : [];
    const hasMore = data.has_more === true;
    const nextCursor = hasMore && data.next_cursor ? data.next_cursor : null;
    return { items, nextCursor, done: !hasMore };
  },
};

