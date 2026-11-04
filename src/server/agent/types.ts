import { z } from "zod";

export const AGENT_CATEGORIES = [
  "coding",
  "research",
  "browser",
  "personal_assistant",
  "productivity",
  "creative",
  "custom",
] as const;
export type AgentCategory = (typeof AGENT_CATEGORIES)[number];

export const AGENT_STATUSES = ["active", "suspended", "revoked"] as const;
export type AgentStatus = (typeof AGENT_STATUSES)[number];

export const AGENT_MODES = ["read_only", "approval", "autonomous"] as const;
export type AgentMode = (typeof AGENT_MODES)[number];

export const AGENT_EVENTS = [
  "memory.created",
  "memory.updated",
  "memory.archived",
  "memory.proposed",
  "memory.approved",
  "memory.conflict_detected",
  "project.updated",
  "context.changed",
  "agent.revoked",
] as const;
export type AgentEvent = (typeof AGENT_EVENTS)[number];

export interface Agent {
  id: string;
  workspaceId: string;
  ownerId: string;
  name: string;
  description: string | null;
  category: AgentCategory;
  integrationType: string;
  authMethod: string;
  status: AgentStatus;
  mode: AgentMode;
  lastActiveAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CredentialMetadata {
  id: string;
  prefix: string;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
}

export interface AgentPrincipal {
  agentId: string;
  userId: string;
  workspaceId: string;
  name: string;
  mode: AgentMode;
  category: AgentCategory;
  status: AgentStatus;
}

export const READ_SCOPES = [
  "read:memory",
  "read:entity",
  "read:graph",
  "read:project",
  "read:preferences",
  "read:documents",
  "read:history",
  "read:insights",
  "read:usage",
  "read:audit",
] as const;

export const WRITE_SCOPES = [
  "propose:memory",
  "write:memory",
  "update:memory",
  "link:memory",
  "archive:memory",
  "delete:memory",
  "write:project",
] as const;

export const ADMIN_SCOPES = ["admin:manage"] as const;
export const ALL_SCOPES = [...READ_SCOPES, ...WRITE_SCOPES, ...ADMIN_SCOPES] as const;
export type Scope = (typeof ALL_SCOPES)[number];

export interface PermissionSet {
  agentId: string;
  workspaceId: string;
  scopes: Scope[];
  memoryTypes: string[];
  projectIds: string[];
  readOnly: boolean;
}

export interface ContributionRecord {
  id: string;
  agentId: string;
  workspaceId: string;
  ownerId: string;
  kind: "memory" | "relationship" | "update" | "delete";
  payload: Record<string, unknown>;
  status: string;
  memoryId: string | null;
  sourceName: string | null;
  sourceDetail: Record<string, unknown> | null;
  duplicateOf: string | null;
  conflictNote: string | null;
  decisionActor: string | null;
  createdAt: string;
  decidedAt: string | null;
}

export const MemoryPayloadSchema = z.object({
  memoryType: z.enum(["episodic", "semantic", "procedural", "associative"]),
  content: z.string().min(1).max(100_000),
  summary: z.string().max(10_000).optional(),
  confidence: z.number().min(0).max(1).optional(),
  validFrom: z.string().nullable().optional(),
  validUntil: z.string().nullable().optional(),
  entities: z
    .array(z.object({ name: z.string().min(1), type: z.string().optional() }))
    .default([]),
});

export const LinkMemorySchema = z.object({
  sourceMemoryId: z.string().min(1),
  targetMemoryId: z.string().min(1),
  relationshipType: z.string().min(1).max(64),
  strength: z.number().min(0).max(1).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const UpdateMemorySchema = z.object({
  content: z.string().min(1).max(100_000).optional(),
  summary: z.string().max(10_000).nullable().optional(),
  memoryType: z.enum(["episodic", "semantic", "procedural", "associative"]).optional(),
  confidence: z.number().min(0).max(1).nullable().optional(),
  validFrom: z.string().nullable().optional(),
  validUntil: z.string().nullable().optional(),
  privacyClassification: z.string().optional(),
});

export interface RegisterAgentInput {
  name: string;
  description?: string;
  category?: AgentCategory;
  integrationType?: string;
  mode?: AgentMode;
  workspaceId?: string;
  scopes?: string[];
  memoryTypes?: string[];
  projectIds?: string[];
}
