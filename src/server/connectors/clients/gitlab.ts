/**
 * MNEMOSYNE Part 8 — GitLab provider adapter.
 *
 * Lists the authenticated user's projects (membership=true) with simple
 * page-number pagination.
 */

import type { RawSource } from "./types";
import {
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

const GITLAB_API = "https://gitlab.com/api/v4";

function toProjectSource(project: Record<string, unknown>): RawSource {
  return {
    externalId: typeof project.id === "number" ? String(project.id) : String(project.id ?? ""),
    recordType: "project",
    title: typeof project.name === "string" ? project.name : null,
    url: typeof project.web_url === "string" ? project.web_url : null,
    modifiedAt: typeof project.last_activity_at === "string" ? project.last_activity_at : null,
    metadata: {
      description: typeof project.description === "string" ? project.description : null,
      visibility: typeof project.visibility === "string" ? project.visibility : null,
      path_with_namespace:
        typeof project.path_with_namespace === "string" ? project.path_with_namespace : null,
    },
  };
}

async function gitlabAccount(accessToken: string): Promise<AccountIdentity> {
  const res = await fetch(`${GITLAB_API}/user`, { headers: bearerAuth(accessToken) });
  const data = (await fetchJson(res, "gitlab")) as {
    id?: unknown;
    username?: unknown;
  };
  return {
    id: typeof data.id === "number" ? String(data.id) : String(data.id ?? ""),
    name: typeof data.username === "string" ? data.username : String(data.username ?? ""),
  };
}

export const gitlabAdapter: ConnectorAdapter = {
  provider: "gitlab",
  async resolveAccount(accessToken: string): Promise<AccountIdentity> {
    return gitlabAccount(accessToken);
  },
  async fetchInitial(params: FetchPageParams): Promise<FetchPageResult> {
    const page = params.cursor ? Math.max(1, parseInt(params.cursor, 10) || 1) : 1;
    const qs = new URLSearchParams({
      membership: "true",
      per_page: String(pageLimit(params.limit)),
      page: String(page),
    });
    const res = await fetch(`${GITLAB_API}/projects?${qs.toString()}`, {
      headers: bearerAuth(params.accessToken),
    });
    const data = await fetchJson(res, "gitlab");
    const rows = Array.isArray(data) ? data : [];
    const items = rows.map((r) => toProjectSource(r as Record<string, unknown>));
    // If we got a full page there may be more pages.
    const nextCursor = items.length >= pageLimit(params.limit) ? String(page + 1) : null;
    return { items, nextCursor, done: !nextCursor };
  },
};
