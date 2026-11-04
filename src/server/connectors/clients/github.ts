/**
 * MNEMOSYNE Part 8 — GitHub provider adapter.
 *
 * Lists the authenticated user's repositories (page-number pagination via the
 * `Link` header) and, on the first page only, enumerates the first page of
 * issues per repository (bounded to avoid oversized syncs). Repos and issues
 * are normalised to distinct record types.
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

const API_BASE = "https://api.github.com";
const USER_AGENT = "mnemosyne-connector";
/** Bound on how many repositories' first page of issues we enumerate. */
const ISSUE_REPO_CAP = 10;

function headers(accessToken: string): Record<string, string> {
  return {
    ...bearerAuth(accessToken),
    Accept: "application/vnd.github+json",
    "User-Agent": USER_AGENT,
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function toRepoSource(repo: Record<string, unknown>): RawSource {
  return {
    externalId: typeof repo.id === "number" ? String(repo.id) : String(repo.id ?? ""),
    recordType: "repository",
    title: typeof repo.name === "string" ? repo.name : null,
    url: typeof repo.html_url === "string" ? repo.html_url : null,
    modifiedAt: coerceTimestamp(repo.updated_at),
    metadata: {
      description: typeof repo.description === "string" ? repo.description : null,
      language: typeof repo.language === "string" ? repo.language : null,
      default_branch: typeof repo.default_branch === "string" ? repo.default_branch : null,
      private: repo.private === true,
      full_name: typeof repo.full_name === "string" ? repo.full_name : null,
    },
  };
}

function toIssueSource(issue: Record<string, unknown>, repoFullName: string): RawSource {
  const user = issue.user as Record<string, unknown> | undefined;
  return {
    externalId: typeof issue.id === "number" ? String(issue.id) : String(issue.id ?? ""),
    recordType: "issue",
    title: typeof issue.title === "string" ? issue.title : null,
    url: typeof issue.html_url === "string" ? issue.html_url : null,
    author: user && typeof user.login === "string" ? user.login : null,
    modifiedAt: coerceTimestamp(issue.updated_at),
    metadata: {
      number: typeof issue.number === "number" ? issue.number : null,
      state: typeof issue.state === "string" ? issue.state : null,
      repository: repoFullName,
      is_pr: Boolean(issue.pull_request),
    },
  };
}

/** Extracts the next page number from GitHub's `Link` header, if present. */
function nextPageFromLink(link: string | null): string | null {
  if (!link) return null;
  const m = link.match(/<([^>]+)>\s*;\s*rel="next"/);
  if (!m) return null;
  const nextUrl = m[1];
  const page = /[?&]page=(\d+)/.exec(nextUrl);
  return page ? page[1] : null;
}

async function fetchRepos(
  accessToken: string,
  cursor?: string | null,
  limit?: number,
): Promise<{ items: RawSource[]; nextCursor: string | null }> {
  const page = cursor ? Math.max(1, parseInt(cursor, 10) || 1) : 1;
  const qs = new URLSearchParams({ per_page: String(pageLimit(limit)), page: String(page) });
  const res = await fetch(`${API_BASE}/user/repos?${qs.toString()}`, {
    headers: headers(accessToken),
  });
  const data = await fetchJson(res, "github");
  const repos = Array.isArray(data) ? data : [];
  const nextCursor = nextPageFromLink(res.headers.get("link"));
  return { items: repos.map((r) => toRepoSource(r as Record<string, unknown>)), nextCursor };
}

async function fetchRepoIssues(
  accessToken: string,
  fullName: string,
): Promise<RawSource[]> {
  const qs = new URLSearchParams({ state: "all", per_page: "100", page: "1" });
  const res = await fetch(
    `${API_BASE}/repos/${encodeURIComponent(fullName)}/issues?${qs.toString()}`,
    { headers: headers(accessToken) },
  );
  const data = await fetchJson(res, "github");
  if (!Array.isArray(data)) return [];
  return data
    .filter((i) => !(i as Record<string, unknown>).pull_request)
    .map((i) => toIssueSource(i as Record<string, unknown>, fullName));
}

async function githubAccount(accessToken: string): Promise<AccountIdentity> {
  const res = await fetch(`${API_BASE}/user`, { headers: headers(accessToken) });
  const data = (await fetchJson(res, "github")) as { id?: unknown; login?: unknown };
  return {
    id: typeof data.id === "number" ? String(data.id) : String(data.id ?? ""),
    name: typeof data.login === "string" ? data.login : String(data.login ?? ""),
  };
}

export const githubAdapter: ConnectorAdapter = {
  provider: "github",
  async resolveAccount(accessToken: string): Promise<AccountIdentity> {
    return githubAccount(accessToken);
  },
  async fetchInitial(params: FetchPageParams): Promise<FetchPageResult> {
    const { items: repoItems, nextCursor } = await fetchRepos(
      params.accessToken,
      params.cursor,
      params.limit,
    );

    // Enumerate a bounded set of first-page issues only on the first page.
    let issueItems: RawSource[] = [];
    if (!params.cursor) {
      const targets = repoItems
        .map((r) => r.metadata?.full_name)
        .filter((n): n is string => typeof n === "string" && n.length > 0)
        .slice(0, ISSUE_REPO_CAP);
      const settled = await Promise.allSettled(
        targets.map((fullName) => fetchRepoIssues(params.accessToken, fullName)),
      );
      issueItems = settled.flatMap((s) => (s.status === "fulfilled" ? s.value : []));
    }

    return {
      items: [...repoItems, ...issueItems],
      nextCursor,
      done: !nextCursor,
    };
  },
};
