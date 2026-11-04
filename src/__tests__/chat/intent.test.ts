import { describe, expect, it } from "vitest";
import {
  analyzeQuery,
  detectAnswerFormat,
  detectCategories,
  detectDeepReasoning,
  detectIntent,
  detectTimeRefs,
  extractKeywords,
  normalizeQuery,
  resolveReferences,
} from "@/server/chat/intent";

describe("normalizeQuery", () => {
  it("lowercases and collapses whitespace", () => {
    expect(normalizeQuery("  What   Projects?  ")).toBe("what projects?");
  });
});

describe("detectIntent", () => {
  it("classifies temporal comparisons", () => {
    expect(detectIntent("how does my current approach compare to before")).toBe("temporal_comparison");
  });
  it("classifies historical questions", () => {
    expect(detectIntent("what was I working on last month")).toBe("historical");
  });
  it("classifies project summaries", () => {
    expect(detectIntent("what is the status of the project")).toBe("project_summary");
  });
  it("classifies preferences", () => {
    expect(detectIntent("what do I prefer for coffee")).toBe("preference");
  });
  it("classifies relationships", () => {
    expect(detectIntent("how are these two projects connected")).toBe("relationship");
  });
  it("classifies procedures", () => {
    expect(detectIntent("how did I deploy this app")).toBe("procedure");
  });
  it("falls back to general", () => {
    expect(detectIntent("hello there")).toBe("general");
  });
});

describe("detectCategories", () => {
  it("extracts project + technology categories", () => {
    const cats = detectCategories("which software did I pick for the project");
    expect(cats).toContain("project");
    expect(cats).toContain("technology");
  });
  it("returns unique categories", () => {
    const cats = detectCategories("project project project");
    expect(cats).toEqual(["project"]);
  });
});

describe("detectAnswerFormat", () => {
  it("chooses timeline for historical", () => {
    expect(detectAnswerFormat("what happened last month", "historical")).toBe("timeline");
  });
  it("chooses comparison for temporal comparison", () => {
    expect(detectAnswerFormat("compare before and after", "temporal_comparison")).toBe("comparison");
  });
  it("chooses procedure for procedure", () => {
    expect(detectAnswerFormat("how did I deploy", "procedure")).toBe("procedure");
  });
});

describe("detectTimeRefs", () => {
  it("detects relative refs", () => {
    const refs = detectTimeRefs("what was I doing last week");
    expect(refs.some((r) => r.raw === "last week")).toBe(true);
  });
  it("detects absolute ISO dates", () => {
    const refs = detectTimeRefs("what happened 2026-02-01");
    expect(refs.some((r) => r.kind === "absolute" && r.value === "2026-02-01")).toBe(true);
  });
});

describe("extractKeywords", () => {
  it("strips stopwords", () => {
    const kws = extractKeywords("what phone was I using before");
    expect(kws).toContain("phone");
    expect(kws).not.toContain("what");
    expect(kws).not.toContain("was");
  });
});

describe("detectDeepReasoning", () => {
  it("flags temporal comparison", () => {
    expect(detectDeepReasoning("compare approaches", "temporal_comparison")).toBe(true);
  });
  it("flags long queries", () => {
    expect(detectDeepReasoning("x".repeat(200), "factual")).toBe(true);
  });
});

describe("resolveReferences", () => {
  it("carries entity hints from prior user messages", () => {
    const resolved = resolveReferences("what happened to that project", [
      "I started AcmeProject with Next.js",
    ]);
    expect(resolved).toContain("AcmeProject");
  });
  it("returns query unchanged without prior context", () => {
    expect(resolveReferences("what project", [])).toBe("what project");
  });
});

describe("analyzeQuery", () => {
  it("returns a full analysis for a project question", () => {
    const a = analyzeQuery("what is the status of the project");
    expect(a.intent).toBe("project_summary");
    expect(a.answerFormat).toBe("summary");
    expect(a.requiresClarification).toBe(false);
    expect(typeof a.inputTokens).toBe("number");
  });
  it("requests clarification for an empty query", () => {
    const a = analyzeQuery("   ");
    expect(a.requiresClarification).toBe(true);
    expect(a.clarificationQuestion).toBeTruthy();
  });
});
