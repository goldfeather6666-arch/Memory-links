/**
 * MNEMOSYNE Part 8 — OneDrive provider adapter.
 *
 * Lists the root drive's direct children (files only) via the Microsoft Graph
 * API and follows `@odata.nextLink` for pagination. NOTE: no MS Graph client
 * env is configured for this deployment; the adapter exists but the UI hides
 * the connect flow unless an encryption secret is present
 * (isProviderConfigured('onedrive') === false).
 */

import type { RawSource } from "./types";
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
} from "./types";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

function toOneDriveSource(item: Record<string, unknown>): RawSource {
  const file = item.file as Record<string, unknown> | undefined;
  return {
    externalId: typeof item.id === "string" ? item.id : String(item.id ?? ""),
    recordType: "file",
    title: typeof item.name === "string" ? item.name : null,
    url: typeof item.webUrl === "string" ? item.webUrl : null,
    modifiedAt: coerceTimestamp(item.lastModifiedDateTime),
    metadata: {
      mimeType: file && typeof file.mimeType === "string" ? file.mimeType : null,
      sizeBytes: typeof item.size === "number" ? item.size : null,
    },
  };
}

async function onedriveAccount(accessToken: string): Promise<AccountIdentity> {
  const res = await fetch(`${GRAPH_BASE}/me`, { headers: bearerAuth(accessToken) });
  const data = (await fetchJson(res, "onedrive")) as {
    id?: unknown;
    displayName?: unknown;
  };
  return {
    id: typeof data.id === "string" ? data.id : String(data.id ?? ""),
    name: typeof data.displayName === "string" ? data.displayName : String(data.displayName ?? ""),
  };
}

export const onedriveAdapter: ConnectorAdapter = {
  provider: "onedrive",
  async resolveAccount(accessToken: string): Promise<AccountIdentity> {
    return onedriveAccount(accessToken);
  },
  async fetchInitial(params: FetchPageParams): Promise<FetchPageResult> {
    const qs = new URLSearchParams({ $top: String(pageLimit(params.limit)) });
    const url =
      typeof params.cursor === "string" && params.cursor
        ? params.cursor
        : `${GRAPH_BASE}/me/drive/root/children?${qs.toString()}`;

    const res = await fetch(url, { headers: bearerAuth(params.accessToken) });
    const data = (await fetchJson(res, "onedrive")) as {
      value?: Record<string, unknown>[];
      "@odata.nextLink"?: string;
    };
    const items = (Array.isArray(data.value) ? data.value : [])
      .filter((v) => v.file && typeof v.file === "object")
      .map(toOneDriveSource);
    const nextCursor = data["@odata.nextLink"] ?? null;
    return { items, nextCursor, done: !nextCursor };
  },
};
