/**
 * MNEMOSYNE Part 6 — BYOK provider key storage.
 *
 * Keys are encrypted at rest with AES-256-GCM using a server-only secret
 * (CHAT_KEY_ENCRYPTION_SECRET). The plaintext key never leaves the server,
 * is never returned to the browser, and only a fingerprint is stored for
 * identification. When the secret is unset, BYOK is disabled.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { getServerEnv } from "@/lib/env";
import { queryTenant } from "@/db/client";

const ALGO = "aes-256-gcm";
const IV_LENGTH = 12;

export interface StoredKey {
  provider: string;
  fingerprint: string;
  model: string | null;
  createdAt: string;
  updatedAt: string;
}

export class BYOKUnavailableError extends Error {
  constructor(
    message = "BYOK is not available in this environment (CHAT_KEY_ENCRYPTION_SECRET is unset).",
  ) {
    super(message);
    this.name = "BYOKUnavailableError";
  }
}

export function byokEnabled(): boolean {
  return Boolean(getServerEnv().CHAT_KEY_ENCRYPTION_SECRET);
}

function secretKey(): Buffer {
  const secret = getServerEnv().CHAT_KEY_ENCRYPTION_SECRET;
  if (!secret) throw new BYOKUnavailableError();
  // Derive a stable 32-byte key from the secret.
  return createHash("sha256").update(String(secret)).digest();
}

export function fingerprintKey(key: string): string {
  return createHash("sha256").update(key).digest("hex").slice(0, 16);
}

function encrypt(plaintext: string): { encrypted: string; tag: string; iv: string } {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGO, secretKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    encrypted: encrypted.toString("base64"),
    tag: tag.toString("base64"),
    iv: iv.toString("base64"),
  };
}

function decrypt(payload: { encrypted: string; tag: string; iv: string }): string {
  const decipher = createDecipheriv(
    ALGO,
    secretKey(),
    Buffer.from(payload.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(payload.tag, "base64"));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(payload.encrypted, "base64")),
    decipher.final(),
  ]);
  return plain.toString("utf8");
}

function parseStorage(combined: string): { encrypted: string; tag: string; iv: string } {
  const parts = combined.split(".");
  if (parts.length !== 3) throw new Error("MALFORMED_KEY_STORAGE");
  return { encrypted: parts[0], tag: parts[1], iv: parts[2] };
}

export async function saveProviderKey(
  userId: string,
  workspaceId: string,
  provider: string,
  apiKey: string,
  model?: string | null,
): Promise<StoredKey> {
  if (!byokEnabled()) throw new BYOKUnavailableError();
  const { encrypted, tag, iv } = encrypt(apiKey);
  const combined = [encrypted, tag, iv].join(".");
  const fingerprint = fingerprintKey(apiKey);
  const rows = await queryTenant<Record<string, unknown>>(
    userId,
    `INSERT INTO chat_provider_keys (workspace_id, provider, encrypted_key, key_fingerprint, model)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (workspace_id, provider)
     DO UPDATE SET encrypted_key = EXCLUDED.encrypted_key, key_fingerprint = EXCLUDED.key_fingerprint, model = EXCLUDED.model
     RETURNING provider, key_fingerprint AS fingerprint, model, created_at AS "createdAt", updated_at AS "updatedAt"`,
    [workspaceId, provider, combined, fingerprint, model ?? null],
  );
  const r = rows[0];
  return {
    provider: String(r.provider),
    fingerprint: String(r.fingerprint),
    model: r.model ? String(r.model) : null,
    createdAt: String(r.createdAt),
    updatedAt: String(r.updatedAt),
  };
}

export async function getProviderKey(
  userId: string,
  workspaceId: string,
  provider: string,
): Promise<{ apiKey: string; model: string | null; fingerprint: string } | null> {
  if (!byokEnabled()) return null;
  const rows = await queryTenant<Record<string, unknown>>(
    userId,
    `SELECT encrypted_key AS "encryptedKey", key_fingerprint AS fingerprint, model
       FROM chat_provider_keys
      WHERE workspace_id = $1 AND provider = $2`,
    [workspaceId, provider],
  );
  const row = rows[0];
  if (!row) return null;
  try {
    const apiKey = decrypt(parseStorage(String(row.encryptedKey)));
    return {
      apiKey,
      model: row.model ? String(row.model) : null,
      fingerprint: String(row.fingerprint),
    };
  } catch {
    // Corrupt or tampered ciphertext; treat as unavailable rather than crash.
    return null;
  }
}

export async function deleteProviderKey(
  userId: string,
  workspaceId: string,
  provider: string,
): Promise<boolean> {
  const rows = await queryTenant<{ id: string }>(
    userId,
    `DELETE FROM chat_provider_keys WHERE workspace_id = $1 AND provider = $2 RETURNING id`,
    [workspaceId, provider],
  );
  return rows.length > 0;
}

export async function listProviderKeys(
  userId: string,
  workspaceId: string,
): Promise<StoredKey[]> {
  if (!byokEnabled()) return [];
  const rows = await queryTenant<Record<string, unknown>>(
    userId,
    `SELECT provider, key_fingerprint AS fingerprint, model, created_at AS "createdAt", updated_at AS "updatedAt"
       FROM chat_provider_keys WHERE workspace_id = $1 ORDER BY provider`,
    [workspaceId],
  );
  return rows.map((r) => ({
    provider: String(r.provider),
    fingerprint: String(r.fingerprint),
    model: r.model ? String(r.model) : null,
    createdAt: String(r.createdAt),
    updatedAt: String(r.updatedAt),
  }));
}
