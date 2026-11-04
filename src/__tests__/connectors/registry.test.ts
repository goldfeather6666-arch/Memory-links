import { describe, expect, it } from "vitest";
import {
  getProvider,
  listConnectors,
  PROVIDERS,
} from "@/server/connectors/registry";

describe("connector registry", () => {
  it("exposes all 11 providers", () => {
    expect(PROVIDERS).toHaveLength(11);
    expect(listConnectors()).toHaveLength(11);
  });

  it("getProvider returns known provider descriptor", () => {
    const github = getProvider("github");
    expect(github.name).toBe("GitHub");
    expect(github.capabilities.oauth).toBe(true);
    expect(github.capabilities.webhooks).toBe(true);
    expect(github.oauth?.pkce).toBe(true);
  });

  it("RSS needs no OAuth but supports incremental import", () => {
    const rss = getProvider("rss");
    expect(rss.capabilities.oauth).toBe(false);
    expect(rss.capabilities.incremental).toBe(true);
    expect(rss.oauth).toBeUndefined();
  });

  it("unknown provider throws", () => {
    // @ts-expect-error intentionally invalid provider id
    expect(() => getProvider("nonexistent")).toThrow(/UNKNOWN_PROVIDER/);
  });

  it("every provider has a category and display fields", () => {
    for (const p of PROVIDERS) {
      expect(p.name).toBeTruthy();
      expect(p.icon).toBeTruthy();
      expect(p.category).toBeTruthy();
      expect(p.description).toBeTruthy();
    }
  });
});
