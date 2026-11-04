/**
 * MNEMOSYNE Part 8 — Dropbox provider adapter.
 *
 * Uses the Dropbox files list_folder API (recursive from the root) with
 * cursor-based continuation via `has_more` + `cursor`.
 */

import type { RawSource } from "./types";
import {
  bearerAuth,
  coerceTimestamp,
  fetchJson,
} from "./types";
import type {
  AccountIdentity,
  ConnectorAdapter,
  FetchPageParams,
  FetchPageResult,
} from "./types";

const API = "https://api.dropboxapi.com";

export const dropboxAdapter: ConnectorAdapter = {
  provider: "dropbox",
  async resolveAccount(accessToken: string): Promise<AccountIdentity> {
    const res = await fetch(`${API}/2/users/get_current_account`, {
      method: "POST",
      headers: { ...bearerAuth(accessToken), "Content-Type": "application/json" },
      body: "{}",
    });
    const data = (await fetchJson(res, "dropbox")) as {
      account_id?: unknown;
      name?: { display_name?: unknown };
    };
    const display = data.name?.display_name;
    return {
      id: typeof data.account_id === "string" ? data.account_id : "dropbox",
      name: typeof display === "string" ? display : "Dropbox",
    };
  },
  async fetchInitial(params: FetchPageParams): Promise<FetchPageResult> {
    const body = params.cursor
      ? { cursor: params.cursor }
      : { path: "", recursive: true, limit: 2000, include_deleted: false };
    const res = await fetch(`${API}/2/files/list_folder${params.cursor ? "/continue" : ""}`, {
      method: "POST",
      headers: { ...bearerAuth(params.accessToken), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await fetchJson(res, "dropbox")) as {
      entries?: Record<string, unknown>[];
      has_more?: boolean;
      cursor?: string;
    };
    const entries = Array.isArray(data.entries) ? data.entries : [];
    const items: RawSource[] = entries
      .filter((e) => e[".tag"] === "file")
      .map((e) => ({
        externalId: typeof e.id === "string" ? e.id : String(e.id ?? ""),
        recordType: "file",
        title: typeof e.name === "string" ? e.name : null,
        modifiedAt: coerceTimestamp(e.server_modified),
        metadata: {
          path_lower: typeof e.path_lower === "string" ? e.path_lower : null,
          size: typeof e.size === "number" ? e.size : null,
        },
      }));
    const hasMore = data.has_more === true;
    return { items, nextCursor: hasMore ? data.cursor ?? null : null, done: !hasMore };
  },
};
