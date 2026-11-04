/**
 * MNEMOSYNE Part 8 — Slack provider adapter.
 *
 * Lists conversations (channels) with `response_metadata.next_cursor`
 * pagination, and — when a set of channel ids is passed via `resourceIds` —
 * also pulls recent messages for those channels via conversations.history.
 * All responses carry an `ok` flag; non-ok responses are treated as errors.
 */

import type { NormalizedSource } from "@/server/connectors/types";
import type { RawSource } from "./types";
import {
  ProviderHttpError,
  bearerAuth,
  fetchJson,
  pageLimit,
} from "./types";
import type {
  AccountIdentity,
  ConnectorAdapter,
  FetchPageParams,
  FetchPageResult,
} from "./types";

const SLACK_API = "https://slack.com/api";

async function assertOk(res: Response, data: Record<string, unknown>): Promise<void> {
  if (data.ok === true) return;
  const err =
    typeof data.error === "string" && data.error ? data.error : `HTTP ${res.status}`;
  throw new ProviderHttpError("slack", res.status, `slack error: ${err}`);
}

function toChannelSource(channel: Record<string, unknown>): RawSource {
  return {
    externalId: typeof channel.id === "string" ? channel.id : String(channel.id ?? ""),
    recordType: "channel",
    title: typeof channel.name === "string" ? channel.name : null,
    url: null,
    metadata: {
      id: typeof channel.id === "string" ? channel.id : null,
      is_private: channel.is_private === true,
    },
  };
}

function slackTsToIso(ts: unknown): string | null {
  if (typeof ts !== "string") return null;
  const seconds = parseFloat(ts);
  if (!Number.isFinite(seconds)) return null;
  const d = new Date(seconds * 1000);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function toMessageSource(message: Record<string, unknown>, channelId: string): RawSource {
  const text = typeof message.text === "string" ? message.text : null;
  const firstLine = text?.split("\n")[0]?.trim().slice(0, 120) ?? null;
  return {
    externalId:
      typeof message.client_msg_id === "string"
        ? message.client_msg_id
        : typeof message.ts === "string"
          ? `${channelId}:${message.ts}`
          : String(message.ts ?? ""),
    recordType: "message",
    title: firstLine,
    content: text,
    author: typeof message.user === "string" ? message.user : null,
    timestamp: slackTsToIso(message.ts),
    metadata: { channel: channelId },
  };
}

async function slackAccount(accessToken: string): Promise<AccountIdentity> {
  const res = await fetch(`${SLACK_API}/auth.test`, { headers: bearerAuth(accessToken) });
  const data = (await fetchJson(res, "slack")) as Record<string, unknown>;
  await assertOk(res, data);
  return {
    id: typeof data.user_id === "string" ? data.user_id : String(data.user_id ?? ""),
    name: typeof data.user === "string" ? data.user : String(data.user ?? ""),
  };
}

export const slackAdapter: ConnectorAdapter = {
  provider: "slack",
  async resolveAccount(accessToken: string): Promise<AccountIdentity> {
    return slackAccount(accessToken);
  },
  async fetchInitial(params: FetchPageParams): Promise<FetchPageResult> {
    // conversations.list limit is capped to our page cap (Slack allows up to
    // 1000, but we stay within the global hard cap).
    const qs = new URLSearchParams({
      limit: String(Math.min(pageLimit(params.limit), 200)),
    });
    if (typeof params.cursor === "string" && params.cursor) {
      qs.set("cursor", params.cursor);
    }

    const res = await fetch(`${SLACK_API}/conversations.list?${qs.toString()}`, {
      headers: bearerAuth(params.accessToken),
    });
    const data = (await fetchJson(res, "slack")) as {
      ok?: boolean;
      error?: string;
      channels?: Record<string, unknown>[];
      response_metadata?: { next_cursor?: string };
    };
    await assertOk(res, data as unknown as Record<string, unknown>);

    const channels = Array.isArray(data.channels) ? data.channels : [];
    const items = channels.map(toChannelSource);
    const nextCursor =
      data.response_metadata?.next_cursor && data.response_metadata.next_cursor !== ""
        ? data.response_metadata.next_cursor
        : null;

    // When a channel selection is provided also pull recent messages for those
    // channels (bounded list each channel).
    const selected = (params.resourceIds ?? []).slice(0, 10);
    if (selected.length > 0) {
      const historyResults = await Promise.allSettled(
        selected.map((channelId) =>
          fetchChannelMessages(params.accessToken, channelId, params.limit),
        ),
      );
      for (const r of historyResults) {
        if (r.status === "fulfilled") items.push(...r.value);
      }
    }

    return { items, nextCursor, done: !nextCursor };
  },
};

async function fetchChannelMessages(
  accessToken: string,
  channelId: string,
  limit?: number,
): Promise<RawSource[]> {
  const qs = new URLSearchParams({
    channel: channelId,
    limit: String(pageLimit(limit)),
  });
  const res = await fetch(`${SLACK_API}/conversations.history?${qs.toString()}`, {
    headers: bearerAuth(accessToken),
  });
  const data = (await fetchJson(res, "slack")) as {
    ok?: boolean;
    error?: string;
    messages?: Record<string, unknown>[];
  };
  await assertOk(res, data as unknown as Record<string, unknown>);
  const messages = Array.isArray(data.messages) ? data.messages : [];
  return messages.map((m) => toMessageSource(m, channelId));
}
