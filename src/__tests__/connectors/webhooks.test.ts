import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  mapWebhookEvent,
  verifyProviderWebhook,
} from "@/server/connectors/webhooks";

const hmacHex = (secret: string, message: string): string =>
  createHmac("sha256", secret).update(message).digest("hex");

describe("connector webhook verification", () => {
  it("GitHub signature with correct HMAC passes", () => {
    const body = JSON.stringify({ ref: "refs/heads/main" });
    const sig = `sha256=${hmacHex("secret", body)}`;
    expect(verifyProviderWebhook("github", body, sig, "secret")).toBe(true);
  });

  it("GitHub wrong signature fails", () => {
    const body = JSON.stringify({ ref: "refs/heads/main" });
    const bogus = `sha256=${hmacHex("other", body)}`;
    expect(verifyProviderWebhook("github", body, bogus, "secret")).toBe(false);
  });

  it("GitHub with wrong prefix fails", () => {
    const body = "payload";
    expect(
      verifyProviderWebhook("github", body, `sha1=${hmacHex("s", body)}`, "secret"),
    ).toBe(false);
  });

  it("missing signature header fails when secret set", () => {
    const body = "payload";
    expect(verifyProviderWebhook("github", body, null, "secret")).toBe(false);
  });

  it("empty secret accepts regardless (not configured)", () => {
    expect(verifyProviderWebhook("github", "payload", null, "")).toBe(true);
  });

  it("Slack v0 signature with event_time passes", () => {
    const ts = "1610000000";
    const body = JSON.stringify({ event_time: Number(ts), type: "message" });
    const sig = `v0=${hmacHex("secret", `v0:${ts}:${body}`)}`;
    expect(verifyProviderWebhook("slack", body, sig, "secret")).toBe(true);
  });

  it("Slack signature without event_time fails", () => {
    const body = JSON.stringify({ type: "message" });
    const sig = `v0=${hmacHex("secret", `v0:123:${body}`)}`;
    expect(verifyProviderWebhook("slack", body, sig, "secret")).toBe(false);
  });

  it("non-implemented provider refuses when secret set", () => {
    const body = "payload";
    expect(verifyProviderWebhook("gmail", body, "whatever", "secret")).toBe(false);
  });
});

describe("connector webhook event mapping", () => {
  it("maps Git push to a webhook sync and resolves repository id", () => {
    const mapped = mapWebhookEvent("github", {
      ref: "refs/heads/main",
      repository: { id: 42 },
    });
    expect(mapped?.trigger).toBe("webhook");
    expect(mapped?.connectionExternalId).toBe("42");
  });

  it("maps GitHub repository full_name when id missing", () => {
    const mapped = mapWebhookEvent("github", {
      pull_request: {},
      repository: { full_name: "acme/repo" },
    });
    expect(mapped?.connectionExternalId).toBe("acme/repo");
  });

  it("maps Slack message event and team_id", () => {
    const mapped = mapWebhookEvent("slack", {
      team_id: "T123",
      event: { type: "message" },
    });
    expect(mapped?.trigger).toBe("webhook");
    expect(mapped?.connectionExternalId).toBe("T123");
  });

  it("returns null for non-trigger payloads", () => {
    expect(mapWebhookEvent("github", {})).toBeNull();
    expect(mapWebhookEvent("slack", { type: "url_verification" })).toBeNull();
    expect(mapWebhookEvent("github", null)).toBeNull();
  });
});
