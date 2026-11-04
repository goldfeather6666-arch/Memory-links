import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  decryptSecret,
  encryptSecret,
  encryptionConfigured,
  randomToken,
  sha256Hex,
  timingSafeEqual,
} from "@/server/agent/crypto";

const SECRET = "test-bridge-encryption-secret-value";

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgres://stub/local");
  vi.stubEnv("AGENT_BRIDGE_ENCRYPTION_SECRET", SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("agent crypto", () => {
  it("sha256Hex is deterministic", () => {
    const a = sha256Hex("hello");
    const b = sha256Hex("hello");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(sha256Hex("hello")).not.toBe(sha256Hex("hell0"));
  });

  it("randomToken yields opaque token, persisted hash, and prefix", () => {
    const t = randomToken();
    expect(t.token).toMatch(/^mem_[A-Za-z0-9_-]+$/);
    expect(t.prefix).toBe(t.token.slice(0, 12));
    expect(t.hash).toBe(sha256Hex(t.token));
    expect(sha256Hex(t.token)).not.toBe(t.token);
    // distinct tokens differ
    const t2 = randomToken();
    expect(t2.token).not.toBe(t.token);
    expect(t2.hash).not.toBe(t.hash);
  });

  it("encryptSecret/decryptSecret roundtrip", () => {
    const enc = encryptSecret("the-raw-agent-secret");
    expect(enc.startsWith("v1:")).toBe(true);
    expect(decryptSecret(enc)).toBe("the-raw-agent-secret");
  });

  it("decryptSecret is non-deterministic across calls and rejects tampered payload", () => {
    const enc1 = encryptSecret("same");
    const enc2 = encryptSecret("same");
    expect(enc1).not.toBe(enc2);
    expect(decryptSecret(enc1)).toBe("same");
    expect(decryptSecret(enc2)).toBe("same");
    const parts = enc1.split(":");
    const tampered = [parts[0], parts[1], parts[2], Buffer.from("AA==", "base64").toString("base64")].join(":");
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it("decryptSecret rejects wrong version header", () => {
    const enc = encryptSecret("x");
    const bogus = enc.replace(/^v1:/, "v0:");
    expect(() => decryptSecret(bogus)).toThrow("BAD_CIPHERTEXT");
  });

  it("encryptionConfigured reflects secret presence", () => {
    expect(encryptionConfigured()).toBe(true);
    vi.stubEnv("AGENT_BRIDGE_ENCRYPTION_SECRET", "");
    vi.stubEnv("CHAT_KEY_ENCRYPTION_SECRET", "");
    expect(encryptionConfigured()).toBe(false);
  });

  it("timingSafeEqual compares constant-time", () => {
    expect(timingSafeEqual("abc", "abc")).toBe(true);
    expect(timingSafeEqual("abc", "abd")).toBe(false);
    expect(timingSafeEqual("abc", "ab")).toBe(false);
    expect(timingSafeEqual("", "")).toBe(true);
  });
});
