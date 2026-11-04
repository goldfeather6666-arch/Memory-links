/**
 * MNEMOSYNE — Part 8 connectors: provider registry.
 *
 * The authoritative list of every supported external provider, its real
 * capabilities and its OAuth endpoint configuration. Capabilities describe
 * what the connector actually implements for that provider — we only claim
 * a capability we genuinely intend to honor. OAuth endpoints are the
 * official production endpoints for each provider.
 */
import { getServerEnv } from "@/lib/env";
import type {
  ConnectorCapabilities,
  ConnectorDescriptor,
  ProviderId,
} from "./types";

function caps(partial: Partial<ConnectorCapabilities>): ConnectorCapabilities {
  return {
    oauth: false,
    webhooks: false,
    incremental: false,
    historicalImport: false,
    selectiveSync: false,
    deletionDetection: false,
    ...partial,
  };
}

export const PROVIDERS: ConnectorDescriptor[] = [
  {
    provider: "google_drive",
    name: "Google Drive",
    icon: "google-drive",
    description: "Files and folders from Google Drive.",
    category: "storage",
    capabilities: caps({
      oauth: true,
      incremental: true,
      historicalImport: true,
      selectiveSync: true,
      deletionDetection: true,
    }),
    oauth: {
      authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      revokeUrl: "https://oauth2.googleapis.com/revoke",
      scopes: ["https://www.googleapis.com/auth/drive.readonly"],
      pkce: true,
    },
  },
  {
    provider: "github",
    name: "GitHub",
    icon: "github",
    description: "Repositories, issues, pull requests and activity.",
    category: "development",
    capabilities: caps({
      oauth: true,
      webhooks: true,
      incremental: true,
      historicalImport: true,
      selectiveSync: true,
      deletionDetection: true,
    }),
    oauth: {
      authorizeUrl: "https://github.com/login/oauth/authorize",
      tokenUrl: "https://github.com/login/oauth/access_token",
      scopes: ["repo", "read:user"],
      pkce: true,
    },
  },
  {
    provider: "notion",
    name: "Notion",
    icon: "notion",
    description: "Pages, databases and workspace content.",
    category: "knowledge",
    capabilities: caps({
      oauth: true,
      webhooks: true,
      incremental: true,
      historicalImport: true,
      selectiveSync: true,
      deletionDetection: true,
    }),
    oauth: {
      authorizeUrl: "https://api.notion.com/v1/oauth/authorize",
      tokenUrl: "https://api.notion.com/v1/oauth/token",
      scopes: ["read"],
      pkce: true,
    },
  },
  {
    provider: "gmail",
    name: "Gmail",
    icon: "gmail",
    description: "Emails and conversations from Gmail.",
    category: "email",
    capabilities: caps({
      oauth: true,
      incremental: true,
      historicalImport: true,
      selectiveSync: true,
      deletionDetection: true,
    }),
    oauth: {
      authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      revokeUrl: "https://oauth2.googleapis.com/revoke",
      scopes: ["https://www.googleapis.com/auth/gmail.readonly"],
      pkce: true,
    },
  },
  {
    provider: "onedrive",
    name: "OneDrive",
    icon: "onedrive",
    description: "Files and folders from Microsoft OneDrive.",
    category: "storage",
    capabilities: caps({
      oauth: true,
      incremental: true,
      historicalImport: true,
      selectiveSync: true,
      deletionDetection: true,
    }),
    oauth: {
      authorizeUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
      tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
      scopes: ["offline_access", "Files.Read.All"],
      pkce: true,
    },
  },
  {
    provider: "gitlab",
    name: "GitLab",
    icon: "gitlab",
    description: "Projects, merge requests and activity from GitLab.",
    category: "development",
    capabilities: caps({
      oauth: true,
      webhooks: true,
      incremental: true,
      historicalImport: true,
      selectiveSync: true,
      deletionDetection: true,
    }),
    oauth: {
      authorizeUrl: "https://gitlab.com/oauth/authorize",
      tokenUrl: "https://gitlab.com/oauth/token",
      scopes: ["read_api", "read_user"],
      pkce: true,
    },
  },
  {
    provider: "slack",
    name: "Slack",
    icon: "slack",
    description: "Channels, messages and workspace collaboration.",
    category: "communication",
    capabilities: caps({
      oauth: true,
      webhooks: true,
      incremental: true,
      selectiveSync: true,
      deletionDetection: true,
    }),
    oauth: {
      authorizeUrl: "https://slack.com/oauth/v2/authorize",
      tokenUrl: "https://slack.com/api/oauth.v2.access",
      scopes: ["channels:history", "channels:read", "users:read"],
      pkce: true,
    },
  },
  {
    provider: "linear",
    name: "Linear",
    icon: "linear",
    description: "Issues, projects and cycles from Linear.",
    category: "project",
    capabilities: caps({
      oauth: true,
      webhooks: true,
      incremental: true,
      historicalImport: true,
      selectiveSync: true,
      deletionDetection: true,
    }),
    oauth: {
      authorizeUrl: "https://linear.app/oauth/authorize",
      tokenUrl: "https://api.linear.app/oauth/token",
      scopes: ["read"],
      pkce: true,
    },
  },
  {
    provider: "jira",
    name: "Jira",
    icon: "jira",
    description: "Issues and projects from Atlassian Jira.",
    category: "project",
    capabilities: caps({
      oauth: true,
      webhooks: true,
      incremental: true,
      historicalImport: true,
      selectiveSync: true,
      deletionDetection: true,
    }),
    oauth: {
      authorizeUrl: "https://auth.atlassian.com/authorize",
      tokenUrl: "https://auth.atlassian.com/oauth/token",
      scopes: ["offline_access", "read:jira-user", "read:jira-work"],
      pkce: true,
    },
  },
  {
    provider: "dropbox",
    name: "Dropbox",
    icon: "dropbox",
    description: "Files and folders from Dropbox.",
    category: "storage",
    capabilities: caps({
      oauth: true,
      webhooks: true,
      incremental: true,
      historicalImport: true,
      selectiveSync: true,
      deletionDetection: true,
    }),
    oauth: {
      authorizeUrl: "https://www.dropbox.com/oauth2/authorize",
      tokenUrl: "https://api.dropboxapi.com/oauth2/token",
      revokeUrl: "https://api.dropboxapi.com/2/auth/token/revoke",
      scopes: ["files.content.read", "account_info.read"],
      pkce: true,
    },
  },
  {
    provider: "rss",
    name: "RSS",
    icon: "rss",
    description: "Fetch articles and posts from any RSS/Atom feed.",
    category: "research",
    capabilities: caps({
      incremental: true,
      historicalImport: true,
    }),
  },
];

const providerIndex = new Map<ProviderId, ConnectorDescriptor>(
  PROVIDERS.map((d) => [d.provider, d]),
);

export function getProvider(provider: ProviderId): ConnectorDescriptor {
  const descriptor = providerIndex.get(provider);
  if (!descriptor) throw new Error(`UNKNOWN_PROVIDER: ${provider}`);
  return descriptor;
}

export function listConnectors(): ConnectorDescriptor[] {
  return PROVIDERS.map((d) => ({ ...d }));
}

/**
 * True when the environment has the OAuth client credentials required to
 * connect this provider. RSS needs no OAuth and is always available.
 * OneDrive has no Microsoft env vars yet; it is treated as configured only
 * when the connector encryption secret is present (placeholder client).
 */
export function isProviderConfigured(provider: ProviderId): boolean {
  const env = getServerEnv();
  switch (provider) {
    case "rss":
      return true;
    case "google_drive":
    case "gmail":
      return Boolean(
        env.GOOGLE_OAUTH_CLIENT_ID && env.GOOGLE_OAUTH_CLIENT_SECRET,
      );
    case "github":
      return Boolean(env.GITHUB_OAUTH_CLIENT_ID && env.GITHUB_OAUTH_CLIENT_SECRET);
    case "notion":
      return Boolean(env.NOTION_OAUTH_CLIENT_ID && env.NOTION_OAUTH_CLIENT_SECRET);
    case "gitlab":
      return Boolean(env.GITLAB_OAUTH_CLIENT_ID && env.GITLAB_OAUTH_CLIENT_SECRET);
    case "slack":
      return Boolean(env.SLACK_OAUTH_CLIENT_ID && env.SLACK_OAUTH_CLIENT_SECRET);
    case "linear":
      return Boolean(env.LINEAR_OAUTH_CLIENT_ID && env.LINEAR_OAUTH_CLIENT_SECRET);
    case "jira":
      return Boolean(env.JIRA_OAUTH_CLIENT_ID && env.JIRA_OAUTH_CLIENT_SECRET);
    case "dropbox":
      return Boolean(
        env.DROPBOX_OAUTH_APP_KEY && env.DROPBOX_OAUTH_APP_SECRET,
      );
    case "onedrive":
      return Boolean(env.CONNECTOR_ENCRYPTION_SECRET && env.GOOGLE_OAUTH_CLIENT_ID);
    default:
      return false;
  }
}
