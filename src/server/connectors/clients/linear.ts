/**
 * MNEMOSYNE Part 8 — Linear provider adapter (GraphQL API).
 *
 * Uses a POST to the Linear GraphQL endpoint with a Bearer API key.
 * `resolveAccount` resolves the viewer; `fetchInitial` pages through issues
 * with cursor-based pagination.
 */

import type { NormalizedSource } from "@/server/connectors/types";
import {
  ProviderHttpError,
  bearerAuth,
  coerceTimestamp,
  pageLimit,
} from "./types";
import type {
  AccountIdentity,
  ConnectorAdapter,
  FetchPageParams,
  FetchPageResult,
} from "./types";

const LINEAR_API = "https://api.linear.app/graphql";

const VIEWER_QUERY = `query Viewer { viewer { id name } }`;

const ISSUES_QUERY = `
  query Issues($after: String, $first: Int) {
    issues(first: $first, after: $after) {
      nodes { id title identifier updatedAt }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

async function graphqlRequest<T>(
  accessToken: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(LINEAR_API, {
    method: "POST",
    headers: {
      ...bearerAuth(accessToken),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  const data = (await fetchJson(res, "linear")) as {
    errors?: { message?: string }[];
    data?: T;
  };
  if (data.errors && data.errors.length > 0) {
    throw new ProviderHttpError(
      "linear",
      res.status,
      `linear GraphQL error: ${data.errors[0]?.message ?? "unknown"}`,
    );
  }
  if (!data.data) {
    throw new ProviderHttpError("linear", res.status, "linear returned no data");
  }
  return data.data;
}

function toIssueSource(issue: Record<string, unknown>): NormalizedSource {
  return {
    externalId: typeof issue.id === "string" ? issue.id : String(issue.id ?? ""),
    recordType: "issue",
    title: typeof issue.title === "string" ? issue.title : null,
    modifiedAt: coerceTimestamp(issue.updatedAt),
    metadata: {
      identifier: typeof issue.identifier === "string" ? issue.identifier : null,
    },
  };
}

export const linearAdapter: ConnectorAdapter = {
  provider: "linear",
  async resolveAccount(accessToken: string): Promise<AccountIdentity> {
    const { viewer } = await graphqlRequest<{ viewer: { id: string; name: string } }>(
      accessToken,
      VIEWER_QUERY,
      {},
    );
    return { id: String(viewer.id ?? ""), name: String(viewer.name ?? "") };
  },
  async fetchInitial(params: FetchPageParams): Promise<FetchPageResult> {
    const variables = {
      after: typeof params.cursor === "string" && params.cursor ? params.cursor : null,
      first: pageLimit(params.limit),
    };
    const result = await graphqlRequest<{
      issues: {
        nodes: Record<string, unknown>[];
        pageInfo: { hasNextPage: boolean; endCursor?: string | null };
      };
    }>(params.accessToken, ISSUES_QUERY, variables);

    const items = (result.issues.nodes ?? []).map(toIssueSource);
    const hasNext = result.issues.pageInfo.hasNextPage === true;
    const nextCursor = hasNext ? result.issues.pageInfo.endCursor ?? null : null;
    return { items, nextCursor, done: !hasNext };
  },
};
