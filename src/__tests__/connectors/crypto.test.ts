import { beforeAll, describe, expect, it } from "vitest";

interface AgentCrypto {
  decryptSecret(payload: string): string;
  encryptSecret(plaintext: string): string;
  encryptionConfigured(): boolean;
  sha256Hex(input: string): string;
}

let crypto: AgentCrypto;

beforeAll(async () => {
  // Provide the server env the crypto module's getServerEnv() requires.
  // (Do not touch DATABASE_URL — the module only validates it, never connects.)
  process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/test";
  process.env.CONNECTOR_ENCRYPTION_SECRET = "test-connector-secret";
  crypto = (await import("@/server/connectors/crypto")) as unknown as AgentCrypto;
});

describe("connector credential encryption", () => {
  it("encryptionConfigured reports true when secret set", () => {
    expect(crypto.encryptionConfigured()).toBe(true);
  });

  it("encrypted secret round-trips", () => {
    const token = "ya29.live-token-123456";
    const enc = crypto.encryptSecret(token);
    expect(enc).not.toContain(token);
    expect(crypto.decryptSecret(enc)).toBe(token);
  });

  it("ciphertext has v1 framing", () => {
    expect(crypto.encryptSecret("abc").startsWith("v1:")).toBe(true);
  });

  it("same plaintext produces different ciphertexts", () => {
    expect(crypto.encryptSecret("one")).not.toBe(crypto.encryptSecret("one"));
  });

  it("tampered ciphertext throws", () => {
    const enc = crypto.encryptSecret("secret");
    const corrupted = enc.slice(0, enc.length - 2) + "xx";
    expect(() => crypto.decryptSecret(corrupted)).toThrow();
  });

  it("non-v1 payload throws", () => {
    expect(() => crypto.decryptSecret("v0:bad:payload")).toThrow("BAD_CIPHERTEXT");
  });

  it("sha256Hex is deterministic", () => {
    expect(crypto.sha256Hex("value")).toBe(crypto.sha256Hex("value"));
    expect(crypto.sha256Hex("value")).toHaveLength(64);
    expect(crypto.sha256Hex("value")).not.toBe(crypto.sha256Hex("other"));
  });
});
