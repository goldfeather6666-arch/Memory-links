import { describe, expect, it } from "vitest";

// Provide the server env required by the crypto module's getServerEnv().
process.env.DATABASE_URL = "postgres://user:pass@localhost:5432/test";
process.env.CONNECTOR_ENCRYPTION_SECRET = "test-connector-secret";

const { decryptSecret, encryptSecret, encryptionConfigured, sha256Hex } =
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("@/server/connectors/crypto") as {
    decryptSecret(payload: string): string;
    encryptSecret(plaintext: string): string;
    encryptionConfigured(): boolean;
    sha256Hex(input: string): string;
  };

describe("connector credential encryption", () => {
  it("encryptionConfigured reports true when secret set", () => {
    expect(encryptionConfigured()).toBe(true);
  });

  it("encrypted secret round-trips", () => {
    const token = "ya29.live-token-123456";
    const enc = encryptSecret(token);
    expect(enc).not.toContain(token);
    expect(decryptSecret(enc)).toBe(token);
  });

  it("ciphertext has v1 framing", () => {
    expect(encryptSecret("abc").startsWith("v1:")).toBe(true);
  });

  it("different plaintexts produce different ciphertexts", () => {
    expect(encryptSecret("one")).not.toBe(encryptSecret("one"));
  });

  it("tampered ciphertext throws", () => {
    const enc = encryptSecret("secret");
    const corrupted = enc.slice(0, enc.length - 2) + "xx";
    expect(() => decryptSecret(corrupted)).toThrow();
  });

  it("non-v1 payload throws", () => {
    expect(() => decryptSecret("v0:bad:payload")).toThrow("BAD_CIPHERTEXT");
  });

  it("sha256Hex is deterministic", () => {
    expect(sha256Hex("value")).toBe(sha256Hex("value"));
    expect(sha256Hex("value")).toHaveLength(64);
    expect(sha256Hex("value")).not.toBe(sha256Hex("other"));
  });
});
