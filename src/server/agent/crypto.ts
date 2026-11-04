import crypto from "node:crypto";
import { getServerEnv } from "@/lib/env";

/** SHA-256 hex of a value (used for token hashing at rest). */
export function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}

/** Generate an opaque agent credential. Only the hash is persisted. */
export function randomToken(): { token: string; hash: string; prefix: string } {
  const bytes = crypto.randomBytes(32);
  const token = "mem_" + bytes.toString("base64url");
  return { token, hash: sha256Hex(token), prefix: token.slice(0, 12) };
}

function encryptionKey(): Buffer {
  const env = getServerEnv();
  const secret = env.AGENT_BRIDGE_ENCRYPTION_SECRET || env.CHAT_KEY_ENCRYPTION_SECRET;
  if (!secret) throw new Error("ENCRYPTION_NOT_CONFIGURED");
  return crypto.createHash("sha256").update(secret, "utf8").digest();
}

/** AES-256-GCM encrypt with random IV; format v1:iv:tag:cipher. */
export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

export function decryptSecret(payload: string): string {
  const [v, ivB64, tagB64, dataB64] = payload.split(":");
  if (v !== "v1") throw new Error("BAD_CIPHERTEXT");
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]);
  return dec.toString("utf8");
}

export function timingSafeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

export function encryptionConfigured(): boolean {
  const env = getServerEnv();
  return Boolean(env.AGENT_BRIDGE_ENCRYPTION_SECRET || env.CHAT_KEY_ENCRYPTION_SECRET);
}
