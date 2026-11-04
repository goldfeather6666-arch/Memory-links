/**
 * Shared TypeScript types mirroring the Postgres schema (migrations/).
 * These are used by the server data layer and route handlers.
 */

export interface User {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  emailVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Workspace {
  id: string;
  ownerId: string;
  name: string;
  description: string | null;
  settings: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceMember {
  workspaceId: string;
  userId: string;
  role: "owner" | "admin" | "member";
  createdAt: string;
}

export interface Project {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  status: "active" | "archived" | "planned";
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface DataSource {
  id: string;
  workspaceId: string;
  sourceType: string;
  name: string;
  metadata: Record<string, unknown>;
  connectionStatus: "not_connected" | "connected" | "error";
  createdAt: string;
}

export type MemoryType = "episodic" | "semantic" | "procedural" | "associative";

export type PrivacyClassification = "private" | "workspace";

export interface MemoryRecord {
  id: string;
  workspaceId: string;
  ownerId: string;
  memoryType: MemoryType;
  content: string;
  summary: string | null;
  sourceRef: string | null;
  confidence: number | null;
  importance: number;
  validFrom: string | null;
  validUntil: string | null;
  privacyClassification: PrivacyClassification;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface MemoryRelationship {
  id: string;
  sourceMemoryId: string;
  targetMemoryId: string;
  relationshipType: string;
  strength: number | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface AuditEvent {
  id: string;
  actorId: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  workspaceId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface Session {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: string;
  createdAt: string;
  lastSeenAt: string | null;
}

export interface AuthToken {
  tokenHash: string;
  userId: string;
  purpose: "email_verify" | "password_reset";
  expiresAt: string;
  usedAt: string | null;
  createdAt: string;
}
