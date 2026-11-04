import { describe, expect, it } from "vitest";
import {
  signupSchema,
  signinSchema,
  resetPasswordSchema,
  workspaceSchema,
  projectSchema,
  memoryRecordSchema,
} from "@/server/validation/schemas";

describe("auth schemas", () => {
  it("rejects invalid email", () => {
    expect(signupSchema.safeParse({ email: "nope", displayName: "A", password: "12345678" }).success).toBe(false);
  });

  it("requires 8+ char password", () => {
    expect(signupSchema.safeParse({ email: "a@b.com", displayName: "A", password: "short" }).success).toBe(false);
  });

  it("accepts valid signup", () => {
    const r = signupSchema.safeParse({ email: "a@b.com", displayName: "A", password: "12345678" });
    expect(r.success).toBe(true);
  });

  it("accepts valid signin", () => {
    expect(signinSchema.safeParse({ email: "a@b.com", password: "12345678" }).success).toBe(true);
  });

  it("validates reset token presence", () => {
    expect(resetPasswordSchema.safeParse({ token: "", password: "12345678" }).success).toBe(false);
    expect(resetPasswordSchema.safeParse({ token: "tok", password: "12345678" }).success).toBe(true);
  });
});

describe("resource schemas", () => {
  it("requires workspace name", () => {
    expect(workspaceSchema.safeParse({ name: "  " }).success).toBe(false);
    expect(workspaceSchema.safeParse({ name: "Team" }).success).toBe(true);
  });

  it("accepts project with default status", () => {
    const r = projectSchema.safeParse({ workspaceId: "w", name: "Proj" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.status).toBe("active");
  });

  it("rejects unknown memory type", () => {
    const r = memoryRecordSchema.safeParse({ workspaceId: "w", memoryType: "bogus", content: "c" });
    expect(r.success).toBe(false);
  });

  it("accepts valid memory record", () => {
    const r = memoryRecordSchema.safeParse({ workspaceId: "w", memoryType: "episodic", content: "c" });
    expect(r.success).toBe(true);
  });
});
