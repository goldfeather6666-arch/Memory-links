import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword, parseHash } from "@/server/auth/password";

describe("password hashing", () => {
  it("round-trips a password", async () => {
    const hash = await hashPassword("hunter2-super-secret");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("hunter2-super-secret", hash)).toBe(true);
  });

  it("starts salt and parameters", async () => {
    const a = await hashPassword("same-password");
    const b = await hashPassword("same-password");
    expect(a).not.toBe(b); // random salt
    expect(parseHash(a).params).toEqual({ N: 16384, r: 8, p: 1 });
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("correct-password");
    expect(await verifyPassword("wrong-password", hash)).toBe(false);
  });

  it("rejects tampered / malformed hashes", async () => {
    expect(await verifyPassword("anything", "not-a-hash")).toBe(false);
    const hash = await hashPassword("x");
    expect(await verifyPassword("x", hash + "x")).toBe(false);
    expect(() => parseHash("scrypt$1$2$3$4")).toThrow();
  });
});
