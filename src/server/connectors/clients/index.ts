/**
 * MNEMOSYNE Part 8 — connector adapter registry.
 *
 * Maps a ProviderId to its provider adapter instance. The sync engine and
 * routes resolve adapters through here; there is exactly one adapter per
 * provider. RSS is a non-OAuth adapter — it reads a feed URL passed through
 * `resourceIds` and needs no access token.
 */

import type { ConnectorAdapter } from "./types";
import { googleAdapter } from "./google";
import { githubAdapter } from "./github";
import { notionAdapter } from "./notion";
import { onedriveAdapter } from "./onedrive";
import { gitlabAdapter } from "./gitlab";
import { slackAdapter } from "./slack";
import { linearAdapter } from "./linear";
import { jiraAdapter } from "./jira";
import { dropboxAdapter } from "./dropbox";
import { rssAdapter } from "./rss";
import type { ProviderId } from "@/server/connectors/types";

const registry: Record<string, ConnectorAdapter> = {
  google_drive: googleAdapter,
  gmail: googleAdapter,
  github: githubAdapter,
  notion: notionAdapter,
  onedrive: onedriveAdapter,
  gitlab: gitlabAdapter,
  slack: slackAdapter,
  linear: linearAdapter,
  jira: jiraAdapter,
  dropbox: dropboxAdapter,
  rss: rssAdapter,
};

/** Resolve the adapter for a provider, or null when unsupported. */
export function getConnectorAdapter(provider: ProviderId): ConnectorAdapter | null {
  return registry[provider] ?? null;
}
