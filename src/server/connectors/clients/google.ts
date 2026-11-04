/**
 * MNEMOSYNE Part 8 — Google provider adapters (google_drive + gmail).
 *
 * Both providers share Google OAuth, so they share the `resolveAccount`
 * userinfo lookup. Drive lists files (fully only, no binary extraction) via
 * the files API; Gmail lists message ids and fetches light metadata headers
 * for a bounded subset (avoiding quota burn) — never full message bodies.
 */

import type { NormalizedSource } from "@/server/connectors/types";
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

const DRIVE_BASE = "https://www.googleapis.com/drive/v3";
const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";
const DRIVE_FIELDS =
  "nextPageToken, files(id, name, mimeType, modifiedTime, webViewLink, parents)";
/** Cap on per-message header fetches during a Gmail page (quota guard). */
const GMAIL_HEADER_CAP = 30;

async function googleAccount(accessToken: string): Promise<AccountIdentity> {
  const res = await fetch(USERINFO_URL, { headers: bearerAuth(accessToken) });
  const data = (await fetchJson(res, "google_drive")) as {
    id?: unknown;
    name?: unknown;
  };
  return {
    id: typeof data.id === "string" ? data.id : String(data.id ?? ""),
    name: typeof data.name === "string" ? data.name : String(data.name ?? ""),
  };
}

function toDriveSource(file: Record<string, unknown>): NormalizedSource {
  const parents = Array.isArray(file.parents) ? (file.parents as unknown[]) : [];
  return {
    externalId: typeof file.id === "string" ? file.id : String(file.id ?? ""),
    recordType: "file",
    title: typeof file.name === "string" ? file.name : null,
    content: null,
    url: typeof file.webViewLink === "string" ? file.webViewLink : null,
    parentId: parents.length > 0 ? String(parents[0]) : null,
    modifiedAt: coerceTimestamp(file.modifiedTime),
    metadata: {
      mimeType: typeof file.mimeType === "string" ? file.mimeType : null,
    },
  };
}

async function listDriveFiles(
  params: FetchPageParams,
  since?: string | null,
): Promise<FetchPageResult> {
  const q = since
    ? `trashed = false and modifiedTime > '${since}'`
    : "trashed = false";
  const qs = new URLSearchParams({
    q,
    fields: DRIVE_FIELDS,
    pageSize: String(pageLimit(params.limit)),
  });
  // For incremental (fetchChanges) the cursor carries the since timestamp, so
  // we do not also treat it as a pagination token.
  if (!since && typeof params.cursor === "string" && params.cursor) {
    qs.set("pageToken", params.cursor);
  }

  const res = await fetch(`${DRIVE_BASE}/files?${qs.toString()}`, {
    headers: bearerAuth(params.accessToken),
  });
  const data = (await fetchJson(res, "google_drive")) as {
    files?: Record<string, unknown>[];
    nextPageToken?: string;
  };
  const items = Array.isArray(data.files) ? data.files.map(toDriveSource) : [];
  return {
    items,
    nextCursor: data.nextPageToken ?? null,
    done: !data.nextPageToken,
  };
}

function gmailInternalDateToIso(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return coerceTimestamp(value);
}

function headerValue(headers: unknown, name: string): string | null {
  if (!Array.isArray(headers)) return null;
  for (const h of headers) {
    const header = h as { name?: unknown; value?: unknown };
    if (header.name === name && typeof header.value === "string") {
      return header.value;
    }
  }
  return null;
}

async function gmailMessageHeaders(
  accessToken: string,
  messageId: string,
): Promise<{ subject: string | null; from: string | null }> {
  const qs = new URLSearchParams({
    format: "metadata",
    metadataHeaders: "Subject",
    metadataHeaders: "From",
  });
  const res = await fetch(
    `${GMAIL_BASE}/messages/${encodeURIComponent(messageId)}?${qs.toString()}`,
    { headers: bearerAuth(accessToken) },
  );
  const data = (await fetchJson(res, "gmail")) as {
    payload?: { headers?: unknown };
  };
  const headers = data.payload?.headers;
  return {
    subject: headerValue(headers, "Subject"),
    from: headerValue(headers, "From"),
  };
}

function toGmailSource(
  message: Record<string, unknown>,
  headers: { subject: string | null; from: string | null },
): NormalizedSource {
  return {
    externalId: typeof message.id === "string" ? message.id : String(message.id ?? ""),
    recordType: "message",
    title: headers.subject,
    content: null,
    author: headers.from,
    threadId: typeof message.threadId === "string" ? message.threadId : null,
    timestamp: gmailInternalDateToIso(message.internalDate),
    metadata: {
      messageId: typeof message.id === "string" ? message.id : null,
      threadId: typeof message.threadId === "string" ? message.threadId : null,
    },
  };
}

async function listGmailMessages(
  params: FetchPageParams,
  after?: string | null,
): Promise<FetchPageResult> {
  const qs = new URLSearchParams({ maxResults: String(pageLimit(params.limit)) });
  if (after) {
    qs.set("q", `after:${after}`);
  } else if (typeof params.cursor === "string" && params.cursor) {
    qs.set("pageToken", params.cursor);
  }

  const res = await fetch(`${GMAIL_BASE}/messages?${qs.toString()}`, {
    headers: bearerAuth(params.accessToken),
  });
  const data = (await fetchJson(res, "gmail")) as {
    messages?: Record<string, unknown>[];
    nextPageToken?: string;
  };
  const messages = Array.isArray(data.messages) ? data.messages : [];

  // Fetch subject/from headers for a bounded subset to avoid quota burn; the
  // rest are returned with title/author null (still captured as messages).
  const cap = Math.min(messages.length, GMAIL_HEADER_CAP);
  const settled = await Promise.allSettled(
    messages.slice(0, cap).map((m) =>
      gmailMessageHeaders(params.accessToken, String(m.id ?? "")),
    ),
  );
  const headerRows = settled.map((s) =>
    s.status === "fulfilled"
      ? s.value
      : { subject: null as string | null, from: null as string | null },
  );

  const items = messages.map((m, idx) =>
    toGmailSource(m, idx < headerRows.length ? headerRows[idx] : { subject: null, from: null }),
  );

  return {
    items,
    nextCursor: data.nextPageToken ?? null,
    done: !data.nextPageToken,
  };
}

export const googleDriveAdapter: ConnectorAdapter = {
  provider: "google_drive",
  async resolveAccount(accessToken: string): Promise<AccountIdentity> {
    return googleAccount(accessToken);
  },
  async fetchInitial(params: FetchPageParams): Promise<FetchPageResult> {
    return listDriveFiles(params);
  },
  async fetchChanges(params: FetchPageParams): Promise<FetchPageResult> {
    const since = typeof params.cursor === "string" && params.cursor ? params.cursor : null;
    return listDriveFiles(params, since);
  },
};

export const gmailAdapter: ConnectorAdapter = {
  provider: "gmail",
  async resolveAccount(accessToken: string): Promise<AccountIdentity> {
    return googleAccount(accessToken);
  },
  async fetchInitial(params: FetchPageParams): Promise<FetchPageResult> {
    return listGmailMessages(params);
  },
  async fetchChanges(params: FetchPageParams): Promise<FetchPageResult> {
    const after = typeof params.cursor === "string" && params.cursor ? params.cursor : null;
    return listGmailMessages(params, after);
  },
};

