import { describe, expect, it } from "vitest";
import {
  estimateCost,
  estimateTokens,
  selectModel,
} from "@/server/intelligence/cost";

describe("estimateTokens", () => {
  it("estimates ~4 chars per token", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("hello world")).toBe(Math.ceil(11 / 4));
  });
});

describe("selectModel", () => {
  it("keeps the small model as default", () => {
    const { escalated, config } = selectModel({ inputTokens: 1000 });
    expect(escalated).toBe(false);
    expect(config.id).toBe("openai-default");
  });

  it("escalates to a larger model only when justified", () => {
    const { escalated, config } = selectModel({ inputTokens: 500_000, requiresDeepReasoning: true });
    expect(escalated).toBe(true);
    expect(config.id).not.toBe("openai-default");
  });

  it("respects an explicit model preference without escalating", () => {
    const { escalated, config } = selectModel({ inputTokens: 500_000 }, "gpt-4o-mini");
    expect(escalated).toBe(false);
    expect(config.small).toBe("gpt-4o-mini");
  });
});

describe("estimateCost", () => {
  it("computes a deterministic cost estimate", () => {
    const cfg = selectModel({ inputTokens: 1_000 }).config;
    const cost = estimateCost(cfg, 1_000, 500);
    expect(cost).toBeGreaterThanOrEqual(0);
    expect(cost).toBeLessThan(1);
  });
});
