/**
 * Per-workspace processing settings (single row per workspace). Auto-consolidation
 * is OFF by default (opt-in). All writes are tenant-checked.
 */

import { queryTenant } from "@/db/client";
import { userHasWorkspaceAccess } from "@/server/data/workspaces";
import {
  DEFAULT_BUDGET_CAP_TOKENS,
  DEFAULT_ENABLED_KINDS,
  INTELLIGENCE_JOB_KINDS,
  type ProcessingSettings,
  type SaveProcessingSettingsInput,
} from "./types";

export const PROCESSING_SETTINGS_SELECT = `
  workspace_id AS "workspaceId",
  automatic_consolidation AS "automaticConsolidation",
  enabled_kinds AS "enabledKinds",
  budget_cap_tokens AS "budgetCapTokens",
  model_preference AS "modelPreference",
  created_at AS "createdAt", updated_at AS "updatedAt"
`;

export async function getProcessingSettings(
  userId: string,
  workspaceId: string,
): Promise<ProcessingSettings> {
  if (!(await userHasWorkspaceAccess(userId, workspaceId))) {
    throw new Error("FORBIDDEN");
  }
  const rows = await queryTenant<Record<string, unknown>>(
    userId,
    `SELECT ${PROCESSING_SETTINGS_SELECT} FROM processing_settings WHERE workspace_id = $1`,
    [workspaceId],
  );
  if (rows[0]) return mapSettingsRow(rows[0]);

  // Default row (ensure existence).
  const inserted = await queryTenant<Record<string, unknown>>(
    userId,
    `INSERT INTO processing_settings (workspace_id, automatic_consolidation, enabled_kinds, budget_cap_tokens)
     VALUES ($1, false, $2, $3)
     ON CONFLICT (workspace_id) DO NOTHING
     RETURNING ${PROCESSING_SETTINGS_SELECT}`,
    [workspaceId, DEFAULT_ENABLED_KINDS, DEFAULT_BUDGET_CAP_TOKENS],
  );
  if (inserted[0]) return mapSettingsRow(inserted[0]);

  const again = await queryTenant<Record<string, unknown>>(
    userId,
    `SELECT ${PROCESSING_SETTINGS_SELECT} FROM processing_settings WHERE workspace_id = $1`,
    [workspaceId],
  );
  return mapSettingsRow(again[0]);
}

export async function saveProcessingSettings(
  userId: string,
  workspaceId: string,
  input: SaveProcessingSettingsInput,
): Promise<ProcessingSettings> {
  if (!(await userHasWorkspaceAccess(userId, workspaceId))) {
    throw new Error("FORBIDDEN");
  }
  const current = await getProcessingSettings(userId, workspaceId);

  const enabledKinds = input.enabledKinds
    ? dedupe(input.enabledKinds.filter((k) => INTELLIGENCE_JOB_KINDS.includes(k)))
    : current.enabledKinds;

  const budgetCapTokens =
    input.budgetCapTokens !== undefined
      ? Math.max(1_000, Math.min(10_000_000, Math.floor(input.budgetCapTokens)))
      : current.budgetCapTokens;

  const automaticConsolidation =
    input.automaticConsolidation !== undefined
      ? input.automaticConsolidation
      : current.automaticConsolidation;

  const modelPreference =
    input.modelPreference !== undefined ? input.modelPreference : current.modelPreference;

  const rows = await queryTenant<Record<string, unknown>>(
    userId,
    `INSERT INTO processing_settings (workspace_id, automatic_consolidation, enabled_kinds, budget_cap_tokens, model_preference)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (workspace_id) DO UPDATE SET
       automatic_consolidation = EXCLUDED.automatic_consolidation,
       enabled_kinds = EXCLUDED.enabled_kinds,
       budget_cap_tokens = EXCLUDED.budget_cap_tokens,
       model_preference = EXCLUDED.model_preference,
       updated_at = now()
     RETURNING ${PROCESSING_SETTINGS_SELECT}`,
    [workspaceId, automaticConsolidation, enabledKinds, budgetCapTokens, modelPreference],
  );
  return mapSettingsRow(rows[0]);
}

function mapSettingsRow(row: Record<string, unknown>): ProcessingSettings {
  return {
    workspaceId: String(row.workspaceId),
    automaticConsolidation: Boolean(row.automaticConsolidation),
    enabledKinds: (row.enabledKinds as IntelligenceJobKind[]) ?? DEFAULT_ENABLED_KINDS,
    budgetCapTokens: Number(row.budgetCapTokens ?? DEFAULT_BUDGET_CAP_TOKENS),
    modelPreference: row.modelPreference ? String(row.modelPreference) : null,
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
  };
}

function dedupe<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}
