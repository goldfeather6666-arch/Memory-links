/**
 * MNEMOSYNE Part 6 — per-workspace chat settings (single row per workspace).
 * Mirrors chat_settings table. Defaults: automatic capture OFF, budget cap
 * 200k tokens, streaming enabled.
 */

import { queryTenant } from "@/db/client";
import { userHasWorkspaceAccess } from "@/server/data/workspaces";
import type { ChatSettings, SaveChatSettingsInput } from "./types";

const CHAT_SETTINGS_SELECT = `
  workspace_id AS "workspaceId",
  automatic_memory_capture AS "automaticMemoryCapture",
  model_preference AS "modelPreference",
  budget_cap_tokens AS "budgetCapTokens",
  allow_streaming AS "allowStreaming",
  created_at AS "createdAt", updated_at AS "updatedAt"
`;

export const DEFAULT_BUDGET_CAP_TOKENS = 200_000;

export async function getChatSettings(
  userId: string,
  workspaceId: string,
): Promise<ChatSettings> {
  if (!(await userHasWorkspaceAccess(userId, workspaceId))) {
    throw new Error("FORBIDDEN");
  }
  const rows = await queryTenant<Record<string, unknown>>(
    userId,
    `SELECT ${CHAT_SETTINGS_SELECT} FROM chat_settings WHERE workspace_id = $1`,
    [workspaceId],
  );
  if (rows[0]) return mapSettingsRow(rows[0]);

  const inserted = await queryTenant<Record<string, unknown>>(
    userId,
    `INSERT INTO chat_settings (workspace_id, automatic_memory_capture, budget_cap_tokens)
     VALUES ($1, false, $2)
     ON CONFLICT (workspace_id) DO NOTHING
     RETURNING ${CHAT_SETTINGS_SELECT}`,
    [workspaceId, DEFAULT_BUDGET_CAP_TOKENS],
  );
  if (inserted[0]) return mapSettingsRow(inserted[0]);

  const again = await queryTenant<Record<string, unknown>>(
    userId,
    `SELECT ${CHAT_SETTINGS_SELECT} FROM chat_settings WHERE workspace_id = $1`,
    [workspaceId],
  );
  return mapSettingsRow(again[0]);
}

export async function saveChatSettings(
  userId: string,
  workspaceId: string,
  input: SaveChatSettingsInput,
): Promise<ChatSettings> {
  if (!(await userHasWorkspaceAccess(userId, workspaceId))) {
    throw new Error("FORBIDDEN");
  }
  const current = await getChatSettings(userId, workspaceId);

  const automaticMemoryCapture =
    input.automaticMemoryCapture !== undefined ? input.automaticMemoryCapture : current.automaticMemoryCapture;
  const modelPreference =
    input.modelPreference !== undefined ? input.modelPreference : current.modelPreference;
  const budgetCapTokens =
    input.budgetCapTokens !== undefined
      ? Math.max(1_000, Math.min(10_000_000, Math.floor(input.budgetCapTokens)))
      : current.budgetCapTokens;
  const allowStreaming =
    input.allowStreaming !== undefined ? input.allowStreaming : current.allowStreaming;

  const rows = await queryTenant<Record<string, unknown>>(
    userId,
    `INSERT INTO chat_settings (workspace_id, automatic_memory_capture, model_preference, budget_cap_tokens, allow_streaming)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (workspace_id) DO UPDATE SET
       automatic_memory_capture = EXCLUDED.automatic_memory_capture,
       model_preference = EXCLUDED.model_preference,
       budget_cap_tokens = EXCLUDED.budget_cap_tokens,
       allow_streaming = EXCLUDED.allow_streaming,
       updated_at = now()
     RETURNING ${CHAT_SETTINGS_SELECT}`,
    [workspaceId, automaticMemoryCapture, modelPreference, budgetCapTokens, allowStreaming],
  );
  return mapSettingsRow(rows[0]);
}

function mapSettingsRow(row: Record<string, unknown>): ChatSettings {
  return {
    workspaceId: String(row.workspaceId),
    automaticMemoryCapture: Boolean(row.automaticMemoryCapture),
    modelPreference: row.modelPreference ? String(row.modelPreference) : null,
    budgetCapTokens: Number(row.budgetCapTokens ?? DEFAULT_BUDGET_CAP_TOKENS),
    allowStreaming: Boolean(row.allowStreaming),
  };
}
