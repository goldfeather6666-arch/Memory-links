import { describe, expect, it } from "vitest";
import {
  canAdmin,
  canArchiveMemory,
  canDeleteMemory,
  canLinkMemory,
  canPropose,
  canReadGraph,
  canReadInsights,
  canReadMemory,
  canReadProject,
  canReadUsage,
  canUpdateMemory,
  canWriteMemory,
  hasScope,
  memoryTypeAllowed,
  projectAllowed,
} from "@/server/agent/permissions";
import type { PermissionSet } from "@/server/agent/types";

const basePerms = (p: Partial<PermissionSet>): PermissionSet => ({
  agentId: "ag-1",
  workspaceId: "ws-1",
  scopes: [],
  memoryTypes: [],
  projectIds: [],
  readOnly: false,
  ...p,
});

describe("agent permissions", () => {
  it("default (null) permission set grants nothing (least privilege)", () => {
    expect(canReadMemory(null)).toBe(false);
    expect(canWriteMemory(null)).toBe(false);
    expect(canPropose(null)).toBe(false);
    expect(canReadProject(null)).toBe(false);
    expect(canReadGraph(null)).toBe(false);
    expect(canAdmin(null)).toBe(false);
    expect(canDeleteMemory(null)).toBe(false);
  });

  it("read:memory scope gates memory reads", () => {
    const p = basePerms({ scopes: ["read:memory"] });
    expect(canReadMemory(p)).toBe(true);
    expect(canWriteMemory(p)).toBe(false);
  });

  it("memory-type restriction blocks unlisted types", () => {
    const p = basePerms({ scopes: ["read:memory"], memoryTypes: ["semantic"] });
    expect(canReadMemory(p, "semantic")).toBe(true);
    expect(canReadMemory(p, "episodic")).toBe(false);
    expect(canReadMemory(p)).toBe(true); // unspecified type: allowed
    // no restriction set -> all allowed
    const p2 = basePerms({ scopes: ["read:memory"], memoryTypes: [] });
    expect(canReadMemory(p2, "procedural")).toBe(true);
  });

  it("project restriction scopes to listed projects", () => {
    expect(projectAllowed(null, "p-1")).toBe(false);
    const unrestricted = basePerms({ projectIds: [] });
    expect(projectAllowed(unrestricted, "p-1")).toBe(true);
    const restricted = basePerms({ projectIds: ["p-1"] });
    expect(projectAllowed(restricted, "p-1")).toBe(true);
    expect(projectAllowed(restricted, "p-2")).toBe(false);
    expect(projectAllowed(restricted)).toBe(true); // no project specified: allowed
  });

  it("read-only mode blocks all write capabilities", () => {
    const p = basePerms({
      scopes: ["write:memory", "update:memory", "link:memory", "archive:memory", "delete:memory", "propose:memory"],
      readOnly: true,
    });
    expect(canWriteMemory(p)).toBe(false);
    expect(canUpdateMemory(p)).toBe(false);
    expect(canLinkMemory(p)).toBe(false);
    expect(canArchiveMemory(p)).toBe(false);
    expect(canDeleteMemory(p)).toBe(false);
    expect(canPropose(p)).toBe(false);
    // reads still allowed
    const pr = basePerms({ scopes: ["read:memory"], readOnly: true });
    expect(canReadMemory(pr)).toBe(true);
  });

  it("write requires explicit write:memory scope (propose allows proposal only)", () => {
    const proposer = basePerms({ scopes: ["propose:memory"] });
    expect(canPropose(proposer)).toBe(true);
    expect(canWriteMemory(proposer)).toBe(false);
    const writer = basePerms({ scopes: ["write:memory"] });
    expect(canWriteMemory(writer)).toBe(true);
    expect(canPropose(writer)).toBe(true);
  });

  it("granular scopes map to their capability", () => {
    expect(canUpdateMemory(basePerms({ scopes: ["update:memory"] }))).toBe(true);
    expect(canLinkMemory(basePerms({ scopes: ["link:memory"] }))).toBe(true);
    expect(canArchiveMemory(basePerms({ scopes: ["archive:memory"] }))).toBe(true);
    expect(canDeleteMemory(basePerms({ scopes: ["delete:memory"] }))).toBe(true);
    expect(canReadProject(basePerms({ scopes: ["read:project"] }))).toBe(true);
    expect(canReadGraph(basePerms({ scopes: ["read:graph"] }))).toBe(true);
    expect(canReadInsights(basePerms({ scopes: ["read:insights"] }))).toBe(true);
    expect(canReadUsage(basePerms({ scopes: ["read:usage"] }))).toBe(true);
    expect(canAdmin(basePerms({ scopes: ["admin:manage"] }))).toBe(true);
  });

  it("hasScope is exact-match", () => {
    const p = basePerms({ scopes: ["read:memory", "read:project"] });
    expect(hasScope(p, "read:memory")).toBe(true);
    expect(hasScope(p, "write:memory")).toBe(false);
    expect(hasScope(null, "read:memory")).toBe(false);
  });

  it("memoryTypeAllowed semantics", () => {
    expect(memoryTypeAllowed(null, "semantic")).toBe(false);
    expect(memoryTypeAllowed(basePerms({}), "semantic")).toBe(true);
    const restricted = basePerms({ memoryTypes: ["episodic"] });
    expect(memoryTypeAllowed(restricted, "episodic")).toBe(true);
    expect(memoryTypeAllowed(restricted, "semantic")).toBe(false);
  });
});
