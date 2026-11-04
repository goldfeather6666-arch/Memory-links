import { describe, expect, it } from "vitest";
import {
  buildConversationContext,
  trimSummary,
  updateRollingSummary,
} from "@/server/conversations/summarize";

describe("trimSummary", () => {
  it("keeps short summaries", () => {
    expect(trimSummary("Short summary")).toBe("Short summary");
  });
  it("truncates long summaries and adds ellipsis", () => {
    const long = "x".repeat(5000);
    const out = trimSummary(long, 400);
    expect(out.length).toBeLessThan(1601);
    expect(out.endsWith("…")).toBe(true);
  });
});

describe("updateRollingSummary", () => {
  it("appends recent exchanges", () => {
    const s = updateRollingSummary("Prior context.", [
      { role: "user", content: "Tell me about the project." },
      { role: "assistant", content: "Here's the plan." },
    ]);
    expect(s).toContain("Prior context.");
    expect(s).toContain("User: Tell me about the project.");
    expect(s).toContain("Assistant: Here's the plan.");
  });
  it("returns prior summary when no new messages", () => {
    expect(updateRollingSummary("only", [])).toBe("only");
  });
});

describe("buildConversationContext", () => {
  it("bounds context to recent messages + summary", () => {
    const messages = Array.from({ length: 30 }, (_, i) => ({
      role: "user" as const,
      content: `message ${i}`,
    }));
    const ctx = buildConversationContext("summary", messages);
    expect(ctx.recentMessages.length).toBeLessThanOrEqual(6);
    expect(ctx.summary).toBe("summary");
    expect(ctx.approximateTokens).toBeGreaterThan(0);
  });
});
