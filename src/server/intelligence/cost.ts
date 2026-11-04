/**
 * Cost + usage accounting for intelligence jobs.
 * - Small-model-first model selection (larger model only when justified).
 * - Token estimation for deterministic scheduling decisions.
 * - Per-workspace budget cap (default + user setting).
 * - Usage stamped to the usage_accounting table for transparency.
 */

import { queryTenant } from "@/db/client";
import { userHasWorkspaceAccess } from "@/server/data/workspaces";
import {
  DEFAULT_BUDGET_CAP_TOKENS,
  type ModelConfig,
  type UsageStampInput,
} from "./types";
import { getProcessingSettings } from "./settings";

/** Default model pricing table (OpenAI-compatible endpoints). */
export const MODELS: ModelConfig[] = [
  {
    id: "openai-small",
    small: "gpt-4o-mini",
    large: "gpt-4o-mini",
    inputPer1M: 0.15,
    outputPer1M: 0.6,
    maxInputTokens: 60_000,
  },
  {
    id: "openai-large",
    small: "gpt-4o",
    large: "gpt-4o",
    inputPer1M: 2.5,
    outputPer1M: 10,
    maxInputTokens: 100_000,
  },
  {
    id: "openai-default",
    small: "gpt-4o-mini",
    large: "gpt-4o",
    inputPer1M: 0.15,
    outputPer1M: 0.6,
    maxInputTokens: 60_000,
  },
];

export function getModelConfig(modelId = "openai-default"): ModelConfig {
  return MODELS.find((m) => m.id === modelId) ?? MODELS[MODELS.length - 1];
}

/** Rough token estimate (English text): ~4 chars per token. */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

export function estimateChatTokens(messages: { role: string; content: string }[]): number {
  let n = 0;
  for (const m of messages) n += estimateTokens(m.content) + 4;
  return n;
}

/**
 * Decide whether a task justifies the larger (more expensive) model. Small-model
 * first; escalate only when input size or required reasoning depth demands it.
 */
export function selectModel(
  task: { inputTokens: number; requiresDeepReasoning?: boolean },
  modelPreference?: string | null,
): { config: ModelConfig; escalated: boolean } {
  if (modelPreference) {
    const picked = MODELS.find((m) => m.small === modelPreference || m.id === modelPreference);
    if (picked) return { config: picked, escalated: false };
  }
  const base = getModelConfig();
  const escalate =
    Boolean(task.requiresDeepReasoning) || task.inputTokens > base.maxInputTokens;
  if (escalate) {
    const large = MODELS.find((m) => m.large !== base.small) ?? base;
    return { config: large, escalated: true };
  }
  return { config: base, escalated: false };
}

export function estimateCost(
  config: ModelConfig,
  inputTokens: number,
  outputTokens: number,
): number {
  return (inputTokens / 1_000_000) * config.inputPer1M + (outputTokens / 1_000_000) * config.outputPer1M;
}

/** Stamp a usage record (best-effort; never throws). */
export async function recordUsage(input: UsageStampInput): Promise<void> {
  try {
    await queryTenant(
      input.ownerId,
      `INSERT INTO usage_accounting (workspace_id, owner_id, job_kind, model, input_tokens, output_tokens, cached, cost_estimate)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        input.workspaceId,
        input.ownerId,
        input.jobKind,
        input.model ?? null,
        input.inputTokens ?? 0,
        input.outputTokens ?? 0,
        input.cached ?? false,
        input.costEstimate ?? 0,
      ],
    );
  } catch {
    // Accounting is non-fatal.
  }
}

/**
 * Sum usage tokens for a workspace within a period. Returns token totals and a
 * cost estimate. Used to enforce the per-workspace budget.
 */
export async function getWorkspaceUsage(
  userId: string,
  workspaceId: string,
  opts: { since?: string; to?: string } = {},
): Promise<{ inputTokens: number; outputTokens: number; costEstimate: number }> {
  if (!(await userHasWorkspaceAccess(userId, workspaceId))) {
    throw new Error("FORBIDDEN");
  }
  const where = [`workspace_id = $1`];
  const values: unknown[] = [workspaceId];
  if (opts.since) {
    values.push(opts.since);
    where.push(`created_at >= $${values.length}`);
  }
  if (opts.to) {
    values.push(opts.to);
    where.push(`created_at <= $${values.length}`);
  }
  const rows = await queryTenant<{ inputTokens: string; outputTokens: string; cost: string }>(
    userId,
    `SELECT COALESCE(SUM(input_tokens), 0)::text AS "inputTokens",
            COALESCE(SUM(output_tokens), 0)::text AS "outputTokens",
            COALESCE(SUM(cost_estimate), 0)::text AS cost
       FROM usage_accounting WHERE ${where.join(" AND ")}`,
    values,
  );
  return {
    inputTokens: Number(rows[0]?.inputTokens ?? 0),
    outputTokens: Number(rows[0]?.outputTokens ?? 0),
    costEstimate: Number(rows[0]?.cost ?? 0),
  };
}

/** Estimated remaining budget headroom (tokens) for a job kind. */
export async function getBudgetHeadroomTokens(
  userId: string,
  workspaceId: string,
): Promise<number> {
  const settings = await getProcessingSettings(userId, workspaceId);
  const cap = settings.budgetCapTokens ?? DEFAULT_BUDGET_CAP_TOKENS;
  // Use a rolling 30-day window.
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const used = await getWorkspaceUsage(userId, workspaceId, { since });
  const totalTokens = used.inputTokens + used.outputTokens;
  return Math.max(0, cap - totalTokens);
}

export async function canRunJob(
  userId: string,
  workspaceId: string,
  estimatedTokens: number,
): Promise<{ allowed: boolean; headroom: number }> {
  const headroom = await getBudgetHeadroomTokens(userId, workspaceId);
  return { allowed: estimatedTokens <= headroom, headroom };
}
