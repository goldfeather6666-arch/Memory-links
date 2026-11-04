/**
 * MNEMOSYNE Part 8 — Jira provider adapter (Atlassian).
 *
 * Atlassian OAuth yields a token applicable across multiple cloud sites. The
 * adapter lists accessible resources to resolve the account, and — when a
 * specific site is passed via `resourceIds[0]` — lists that site's projects.
 */

import type { NormalizedSource } from "@/server/connectors/types";
import type { RawSource } from "./types";
import {
  bearerAuth,
  fetchJson,
} from "./types";
import type {
  AccountIdentity,
  ConnectorAdapter,
  FetchPageParams,
  FetchPageResult,
} from "./types";

const ATLASSIAN_API = "https://api.atlassian.com";

export const jiraAdapter: ConnectorAdapter = {
  provider: "jira",
  async resolveAccount(accessToken: string): Promise<AccountIdentity> {
    const res = await fetch(
      `${ATLASSIAN_API}/oauth/token/accessible-resources`,
      { headers: bearerAuth(accessToken) },
    );
    const data = (await fetchJson(res, "jira")) as Array<{
      id?: unknown;
      name?: unknown;
    }>;
    const first = Array.isArray(data) ? data[0] : undefined;
    return {
      id: first && typeof first.id === "string" ? first.id : String(first?.id ?? "jira"),
      name: first && typeof first.name === "string" ? first.name : "Jira",
    };
  },
  async fetchInitial(params: FetchPageParams): Promise<FetchPageResult> {
    // Jira sites are not enumerable from the token alone; require an explicit
    // site via resourceIds[0]. Without it we return an empty page.
    const site = params.resourceIds?.[0];
    if (!site) {
      return { items: [], done: true };
    }
    const url = `https://${site}/rest/api/3/project`;
    const res = await fetch(url, { headers: bearerAuth(params.accessToken) });
    const data = await fetchJson(res, "jira");
    const projects = Array.isArray(data) ? data : [];
    const items: RawSource[] = projects.map((p) => {
      const rec = p as Record<string, unknown>;
      return {
        externalId: typeof rec.id === "string" ? rec.id : String(rec.id ?? ""),
        recordType: "project",
        title: typeof rec.name === "string" ? rec.name : null,
        url: `https://${site}/browse/${String(rec.key ?? "")}`,
        metadata: {
          site,
          key: typeof rec.key === "string" ? rec.key : null,
        },
      };
    });
    return { items, done: true };
  },
};
