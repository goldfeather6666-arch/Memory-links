/**
 * Client-side types for the Integrations Center. These mirror the exact
 * JSON shapes returned by the Integrations API routes.
 */

export interface ConnectorCapabilities {
  oauth: boolean;
  webhooks: boolean;
  incremental: boolean;
  historicalImport: boolean;
  selectiveSync: boolean;
  deletionDetection: boolean;
}

export interface Connector {
  provider: string;
  name: string;
  category: string;
  description: string;
  available: boolean;
  capabilities: ConnectorCapabilities;
  connected: number;
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
  provider: string;
  externalAccountId: string;
  accountName: string | null;
  name: string;
  status: ConnectionStatus;
  scope: string[];
  selectedResources: Array<{
    id?: string;
    type?: string;
    title?: string;
    name?: string;
    label?: string;
  }>;
  syncIntervalMin: number | null;
  lastSyncAt: string | null;
  nextSyncAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SyncRun {
  id: string;
  status: string;
  trigger: string;
  recordsDiscovered: number;
  recordsImported: number;
  recordsUpdated: number;
  recordsSkipped: number;
  recordsFailed: number;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

export interface SourceRecord {
  id: string;
  recordType: string;
  title: string | null;
  url: string | null;
  status: string;
  sourceTimestamp: string | null;
  modifiedAt: string | null;
  lastIngestionId: string | null;
  createdAt: string;
}

export interface SyncResult {
  discovered: number;
  imported: number;
  updated: number;
  skipped: number;
  failed: number;
  error?: string | null;
}

export interface IntegrationsConfigResponse {
  connectors: Connector[];
}

export interface ConnectionsResponse {
  connections: ConnectionRecord[];
}

export interface ConnectResponse {
  url: string;
}

export interface ConnectionDetailResponse {
  connection: ConnectionRecord;
  runs: SyncRun[];
  sources: SourceRecord[];
}

export interface ConnectionMutationResponse {
  connection: ConnectionRecord;
}

export interface SyncResponse {
  result: SyncResult;
}
