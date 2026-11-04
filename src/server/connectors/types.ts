/**
 * MNEMOSYNE — Part 8 universal connectors.
 * Shared type contracts for the connector services. These types are the
 * authoritative interface between the connector core (registry/oauth/
 * connections), the per-provider sync adapters and the HTTP routes.
 *
 * NOTE: This module is intentionally side-effect free and contains no
 * imports — it defines the cross-module contract used by all connector code.
 */

export type ProviderId =
  | "google_drive"
  | "github"
  | "notion"
  | "gmail"
  | "onedrive"
  | "gitlab"
  | "slack"
  | "linear"
  | "jira"
  | "dropbox"
  | "rss";

export type ConnectorCategory =
  | "storage"
  | "development"
  | "knowledge"
  | "email"
  | "communication"
  | "project"
  | "research";

export interface ConnectorCapabilities {
  oauth: boolean;
  webhooks: boolean;
  incremental: boolean;
  historicalImport: boolean;
  selectiveSync: boolean;
  deletionDetection: boolean;
}

export interface ConnectorOAuthConfig {
  authorizeUrl: string;
  tokenUrl: string;
  revokeUrl?: string;
  scopes: string[];
  pkce: boolean;
}

export interface ConnectorDescriptor {
  provider: ProviderId;
  name: string;
  icon: string;
  description: string;
  category: ConnectorCategory;
  capabilities: ConnectorCapabilities;
  oauth?: ConnectorOAuthConfig;
}

export type ConnectionStatus =
  | "not_connected"
  | "awaiting"
  | "connected"
  | "syncing"
  | "paused"
  | "expired"
  | "failed"
  | "disconnected";

export interface ConnectionRecord {
  id: string;
  workspaceId: string;
  ownerId: string;
  provider: ProviderId;
  externalAccountId: string;
  accountName: string | null;
  name: string;
  status: ConnectionStatus;
  scope: string[];
  selectedResources: unknown[];
  syncIntervalMin: number | null;
  lastSyncAt: string | null;
  nextSyncAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NormalizedSource {
  provider: ProviderId;
  connectionId: string;
  workspaceId: string;
  externalId: string;
  recordType: string;
  title: string | null;
  content: string | null;
  author: string | null;
  timestamp: string | null;
  modifiedAt: string | null;
  url: string | null;
  parentId: string | null;
  threadId: string | null;
  fileMeta?: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
}

export interface SyncResult {
  discovered: number;
  imported: number;
  updated: number;
  skipped: number;
  failed: number;
  error?: string | null;
}

export interface ConnectorToken {
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: number | null;
  scope: string[];
  tokenType?: string;
}
