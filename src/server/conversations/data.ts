/**
 * MNEMOSYNE Part 6 — conversation + message persistence.
 *
 * Every function is gated on workspace membership and queries go through
 * queryTenant (RLS scoped to the calling user). Never trusts client-supplied
 * ids beyond the session.
 */

import { queryTenant } from "@/db/client";
import { userHasWorkspaceAccess } from "@/server/data/workspaces";
import type {
  ConversationRecord,
  MessagePage,
  MessageRecord,
  NewConversationInput,
  SendMessageInput,
  UpdateConversationInput,
} from "./types";

// ---------------------------------------------------------------------------
// Row mappers
// ---------------------------------------------------------------------------

const CONVERSATION_SELECT = `
  c.id, c.workspace_id AS "workspaceId", c.owner_id AS "ownerId",
  c.title, c.summary, c.status, c.metadata,
  c.created_at AS "createdAt", c.updated_at AS "updatedAt",
  (SELECT max(m.created_at) FROM conversation_messages m
    WHERE m.conversation_id = c.id) AS "lastMessageAt",
  (SELECT count(*)::int FROM conversation_messages m
    WHERE m.conversation_id = c.id) AS "messageCount"
`;

const MESSAGE_SELECT = `
  id, conversation_id AS "conversationId", workspace_id AS "workspaceId",
  owner_id AS "ownerId", role, content, tokens, evidence, context, status, error,
  client_request_id AS "clientRequestId", parent_id AS "parentId",
  created_at AS "createdAt", updated_at AS "updatedAt"
`;

function mapConversation(row: Record<string, unknown>): ConversationRecord {
  return {
    id: String(row.id),
    workspaceId: String(row.workspaceId),
    ownerId: String(row.ownerId),
    title: String(row.title),
    summary: row.summary ? String(row.summary) : null,
    status: row.status as ConversationRecord["status"],
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
    lastMessageAt: row.lastMessageAt ? String(row.lastMessageAt) : null,
    messageCount: Number(row.messageCount ?? 0),
  };
}

function mapMessage(row: Record<string, unknown>): MessageRecord {
  return {
    id: String(row.id),
    conversationId: String(row.conversationId),
    workspaceId: String(row.workspaceId),
    ownerId: String(row.ownerId),
    role: row.role as MessageRecord["role"],
    content: String(row.content),
    tokens: row.tokens !== null && row.tokens !== undefined ? Number(row.tokens) : null,
    evidence: (row.evidence as MessageRecord["evidence"]) ?? [],
    context: (row.context as Record<string, unknown>) ?? {},
    status: row.status as MessageRecord["status"],
    error: row.error ? String(row.error) : null,
    clientRequestId: row.clientRequestId ? String(row.clientRequestId) : null,
    parentId: row.parentId ? String(row.parentId) : null,
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
  };
}

async function accessGuard(userId: string, workspaceId: string): Promise<void> {
  if (!(await userHasWorkspaceAccess(userId, workspaceId))) {
    throw new Error("FORBIDDEN");
  }
}

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------

export async function createConversation(
  userId: string,
  input: NewConversationInput,
): Promise<ConversationRecord> {
  await accessGuard(userId, input.workspaceId);
  const title = input.title?.trim() ? input.title.trim().slice(0, 200) : "New conversation";
  const rows = await queryTenant<Record<string, unknown>>(
    userId,
    `INSERT INTO conversations (workspace_id, owner_id, title)
     VALUES ($1, $2, $3) RETURNING ${CONVERSATION_SELECT}`,
    [input.workspaceId, userId, title],
  );
  return mapConversation(rows[0]);
}

export async function listConversations(
  userId: string,
  workspaceId: string,
  opts: { status?: "active" | "archived"; query?: string; limit?: number; offset?: number } = {},
): Promise<{ items: ConversationRecord[]; total: number }> {
  await accessGuard(userId, workspaceId);
  const where = [`c.workspace_id = $1`];
  const values: unknown[] = [workspaceId];
  if (opts.status) {
    values.push(opts.status);
    where.push(`c.status = $${values.length}`);
  }
  if (opts.query?.trim()) {
    values.push(opts.query.trim());
    where.push(`(c.title ILIKE $${values.length} OR coalesce(c.summary,'') ILIKE $${values.length})`);
  }
  const limit = Math.min(opts.limit ?? 50, 200);
  const offset = opts.offset ?? 0;
  const whereSql = where.join(" AND ");
  const countRows = await queryTenant<{ count: string }>(
    userId,
    `SELECT count(*)::text AS count FROM conversations c WHERE ${whereSql}`,
    values,
  );
  const total = Number(countRows[0]?.count ?? 0);
  const rows = await queryTenant<Record<string, unknown>>(
    userId,
    `SELECT ${CONVERSATION_SELECT}
       FROM conversations c
      WHERE ${whereSql}
      ORDER BY "lastMessageAt" DESC NULLS LAST, c.updated_at DESC
      LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, limit, offset],
  );
  return { items: rows.map(mapConversation), total };
}

export async function getConversation(
  userId: string,
  conversationId: string,
): Promise<ConversationRecord | null> {
  const rows = await queryTenant<Record<string, unknown>>(
    userId,
    `SELECT ${CONVERSATION_SELECT}
       FROM conversations c WHERE c.id = $1`,
    [conversationId],
  );
  return rows[0] ? mapConversation(rows[0]) : null;
}

export async function updateConversation(
  userId: string,
  conversationId: string,
  input: UpdateConversationInput,
): Promise<ConversationRecord | null> {
  const current = await getConversation(userId, conversationId);
  if (!current) return null;
  await accessGuard(userId, current.workspaceId);
  const title = input.title !== undefined ? input.title.trim().slice(0, 200) : current.title;
  const status = input.status ?? current.status;
  const summary = input.summary !== undefined ? input.summary : current.summary;
  const rows = await queryTenant<Record<string, unknown>>(
    userId,
    `UPDATE conversations SET title = $2, status = $3, summary = $4
     WHERE id = $1 RETURNING ${CONVERSATION_SELECT}`,
    [conversationId, title, status, summary],
  );
  return rows[0] ? mapConversation(rows[0]) : null;
}

export async function deleteConversation(
  userId: string,
  conversationId: string,
): Promise<boolean> {
  const current = await getConversation(userId, conversationId);
  if (!current) return false;
  await accessGuard(userId, current.workspaceId);
  const rows = await queryTenant<{ id: string }>(
    userId,
    `DELETE FROM conversations WHERE id = $1 RETURNING id`,
    [conversationId],
  );
  return rows.length > 0;
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export async function listMessages(
  userId: string,
  conversationId: string,
  opts: { limit?: number; before?: string } = {},
): Promise<MessagePage> {
  const conversation = await getConversation(userId, conversationId);
  if (!conversation) throw new Error("NOT_FOUND");
  await accessGuard(userId, conversation.workspaceId);
  const pageSize = Math.min(opts.limit ?? 50, 200);
  const where = [`conversation_id = $1`];
  const values: unknown[] = [conversationId];
  if (opts.before) {
    values.push(opts.before);
    where.push(`created_at < $${values.length}`);
  }
  const whereSql = where.join(" AND ");
  const countRows = await queryTenant<{ count: string }>(
    userId,
    `SELECT count(*)::text AS count FROM conversation_messages WHERE ${whereSql}`,
    values,
  );
  const total = Number(countRows[0]?.count ?? 0);
  const rows = await queryTenant<Record<string, unknown>>(
    userId,
    `SELECT ${MESSAGE_SELECT} FROM conversation_messages
      WHERE ${whereSql}
      ORDER BY created_at ASC
      LIMIT $${values.length + 1}`,
    [...values, pageSize],
  );
  return {
    items: rows.map(mapMessage),
    total,
    page: 0,
    pageSize,
  };
}

export async function getMessage(
  userId: string,
  messageId: string,
): Promise<MessageRecord | null> {
  const rows = await queryTenant<Record<string, unknown>>(
    userId,
    `SELECT ${MESSAGE_SELECT} FROM conversation_messages WHERE id = $1`,
    [messageId],
  );
  return rows[0] ? mapMessage(rows[0]) : null;
}

export async function createUserMessage(
  userId: string,
  conversationId: string,
  input: SendMessageInput,
): Promise<MessageRecord> {
  const conversation = await getConversation(userId, conversationId);
  if (!conversation) throw new Error("NOT_FOUND");
  await accessGuard(userId, conversation.workspaceId);
  const rows = await queryTenant<Record<string, unknown>>(
    userId,
    `INSERT INTO conversation_messages (conversation_id, workspace_id, owner_id, role, content, status, client_request_id)
     VALUES ($1, $2, $3, 'user', $4, 'completed', $5)
     RETURNING ${MESSAGE_SELECT}`,
    [conversationId, conversation.workspaceId, userId, input.content.trim(), input.clientRequestId ?? null],
  );
  return mapMessage(rows[0]);
}

export async function createAssistantMessage(
  userId: string,
  conversationId: string,
  input: {
    content: string;
    status: MessageRecord["status"];
    evidence?: MessageRecord["evidence"];
    context?: Record<string, unknown>;
    tokens?: number | null;
    error?: string | null;
    clientRequestId?: string | null;
    parentId?: string | null;
  },
): Promise<MessageRecord> {
  const conversation = await getConversation(userId, conversationId);
  if (!conversation) throw new Error("NOT_FOUND");
  await accessGuard(userId, conversation.workspaceId);
  const rows = await queryTenant<Record<string, unknown>>(
    userId,
    `INSERT INTO conversation_messages (conversation_id, workspace_id, owner_id, role, content, status, evidence, context, tokens, error, client_request_id, parent_id)
     VALUES ($1, $2, $3, 'assistant', $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING ${MESSAGE_SELECT}`,
    [
      conversationId,
      conversation.workspaceId,
      userId,
      input.content,
      input.status,
      input.evidence ?? [],
      input.context ?? {},
      input.tokens ?? null,
      input.error ?? null,
      input.clientRequestId ?? null,
      input.parentId ?? null,
    ],
  );
  return mapMessage(rows[0]);
}

export async function updateMessageStatus(
  userId: string,
  messageId: string,
  patch: {
    status: MessageRecord["status"];
    content?: string;
    evidence?: MessageRecord["evidence"];
    tokens?: number | null;
    error?: string | null;
  },
): Promise<MessageRecord | null> {
  const current = await getMessage(userId, messageId);
  if (!current) return null;
  await accessGuard(userId, current.workspaceId);
  const content = patch.content !== undefined ? patch.content : current.content;
  const evidence = patch.evidence !== undefined ? patch.evidence : current.evidence;
  const tokens = patch.tokens !== undefined ? patch.tokens : current.tokens;
  const error = patch.error !== undefined ? patch.error : current.error;
  const rows = await queryTenant<Record<string, unknown>>(
    userId,
    `UPDATE conversation_messages
        SET status = $2, content = $3, evidence = $4, tokens = $5, error = $6
      WHERE id = $1 RETURNING ${MESSAGE_SELECT}`,
    [messageId, patch.status, content, evidence, tokens, error],
  );
  return rows[0] ? mapMessage(rows[0]) : null;
}

export async function deleteAssistantMessage(
  userId: string,
  messageId: string,
): Promise<boolean> {
  const current = await getMessage(userId, messageId);
  if (!current) return false;
  if (current.role !== "assistant") return false;
  await accessGuard(userId, current.workspaceId);
  const rows = await queryTenant<{ id: string }>(
    userId,
    `DELETE FROM conversation_messages WHERE id = $1 AND role = 'assistant' RETURNING id`,
    [messageId],
  );
  return rows.length > 0;
}

/** Ensure a conversation has a title before a message lands (auto-title). */
export async function ensureConversationTitle(
  userId: string,
  conversationId: string,
  fallback: string,
): Promise<void> {
  const conversation = await getConversation(userId, conversationId);
  if (!conversation) return;
  const current = conversation.title.trim();
  if (current && current !== "New conversation") return;
  const title = fallback.trim().slice(0, 200) || "New conversation";
  await queryTenant(
    userId,
    `UPDATE conversations SET title = $2 WHERE id = $1`,
    [conversationId, title],
  );
}
