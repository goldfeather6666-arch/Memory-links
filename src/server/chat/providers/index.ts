/**
 * MNEMOSYNE Part 6 — chat provider resolution.
 *
 * Priority:
 *   1. BYOK key for this workspace (if present and enabled);
 *   2. Server env (CHAT_PROVIDER=openai + OPENAI_API_KEY).
 *
 * Returns null when nothing is configured, which is a legitimate state: the
 * engine then uses the deterministic grounded path. We never silently switch
 * to an unauthorized provider — resolution is explicit.
 */

import { getServerEnv } from "@/lib/env";
import { getProviderKey } from "@/server/chat/byok";
import { createOpenAIProvider } from "./openai";
import type { ChatProvider, ChatProviderConfig, ChatModelSet } from "./types";

export interface ResolvedChatProvider {
  provider: ChatProvider | null;
  modelSet: ChatModelSet;
  via: "env" | "byok" | "none";
  configuredModel: string | null;
}

export async function resolveChatProvider(
  userId: string,
  workspaceId: string,
  modelPreference?: string | null,
): Promise<ResolvedChatProvider> {
  const env = getServerEnv();
  const modelSet: ChatModelSet = {
    small: env.CHAT_MODEL_SMALL,
    large: env.CHAT_MODEL_LARGE,
  };

  // 1. BYOK key for this workspace (OpenAI-compatible).
  const configuredProvider = env.CHAT_PROVIDER;
  try {
    const byok = await getProviderKey(userId, workspaceId, configuredProvider || "openai");
    if (byok) {
      const config: ChatProviderConfig = {
        apiKey: byok.apiKey,
        baseUrl: env.OPENAI_BASE_URL,
        model: byok.model ?? modelPreference ?? modelSet.small,
      };
      const provider = configuredProvider === "openai" ? createOpenAIProvider(config) : null;
      return {
        provider,
        modelSet,
        via: provider ? "byok" : "none",
        configuredModel: provider ? config.model : null,
      };
    }
  } catch {
    // BYOK unavailable/corrupt — fall through to env.
  }

  // 2. Server env.
  if (configuredProvider === "openai" && env.OPENAI_API_KEY) {
    const config: ChatProviderConfig = {
      apiKey: env.OPENAI_API_KEY,
      baseUrl: env.OPENAI_BASE_URL,
      model: modelPreference ?? modelSet.small,
    };
    return {
      provider: createOpenAIProvider(config),
      modelSet,
      via: "env",
      configuredModel: config.model,
    };
  }

  return { provider: null, modelSet, via: "none", configuredModel: null };
}
