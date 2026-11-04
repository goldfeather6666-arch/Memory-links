/**
 * MNEMOSYNE Part 8 — RSS provider adapter (non-OAuth).
 *
 * Fetches an RSS/Atom feed URL passed through `resourceIds[0]` (or from an
 * empty token), parses it with regex/string scans (no XML dependency), and
 * normalises each entry. Requires no access token.
 */

import type { NormalizedSource } from "@/server/connectors/types";
import {
  ProviderHttpError,
  decodeXmlEntities,
  stripCData,
} from "./types";
import type {
  AccountIdentity,
  ConnectorAdapter,
  FetchPageParams,
  FetchPageResult,
  RawSource,
} from "./types";

function extract(value: string | undefined): string | null {
  if (!value) return null;
  const stripped = stripCData(value.trim());
  const decoded = decodeXmlEntities(stripped);
  return decoded.length > 0 ? decoded : null;
}

function parseItems(feed: string): RawSource[] {
  const items: RawSource[] = [];
  // Match <item>...</item> (RSS 2.0) and <entry>...</entry> (Atom).
  const blockRe = /<(?:item|entry)(?:[^>]*)>([\s\S]*?)<\/(?:item|entry)>/gi;
  let match: RegExpExecArray | null;
  let idx = 0;
  while ((match = blockRe.exec(feed)) !== null && idx < 100) {
    const block = match[1];
    const get = (tag: string): string | null => {
      const m = new RegExp(`<${tag}(?:[^>]*)>([\s\S]*?)<\/${tag}>`, "i").exec(block);
      return m ? extract(m[1]) : null;
    };
    const title = get("title");
    const link = get("link") ?? get("guid");
    const description = get("description") ?? get("summary") ?? get("content");
    const pubDate = get("pubDate") ?? get("updated") ?? get("published");
    if (!title && !description) {
      idx += 1;
      continue;
    }
    items.push({
      externalId: `${link ?? ""}:${idx}`,
      recordType: "article",
      title,
      content: description,
      url: link,
      timestamp: pubDate,
      metadata: {},
    });
    idx += 1;
  }
  return items;
}

export const rssAdapter: ConnectorAdapter = {
  provider: "rss",
  async resolveAccount(_accessToken: string): Promise<AccountIdentity> {
    // RSS has no account identity; the feed URL is the identity.
    return { id: "rss", name: "RSS" };
  },
  async fetchInitial(params: FetchPageParams): Promise<FetchPageResult> {
    const feedUrl = params.resourceIds?.[0];
    if (!feedUrl) {
      return { items: [], done: true };
    }
    const res = await fetch(feedUrl);
    const text = await res.text().catch(() => "");
    if (!res.ok) {
      throw new ProviderHttpError("rss", res.status, "rss fetch failed");
    }
    return { items: parseItems(text), done: true };
  },
};
