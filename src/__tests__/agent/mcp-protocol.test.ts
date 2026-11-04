import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  InMemoryTransport,
  LATEST_PROTOCOL_VERSION,
  type McpServer,
} from "@modelcontextprotocol/server";
import { buildMcpServer } from "@/server/agent/mcp/server";
import type { AgentPrincipal } from "@/server/agent/types";

// ---- Mock the service layer so tools run deterministically without a DB ----
const mockRecall = vi.fn(async (..._args: unknown[]) => ({
  items: [
    {
      memory_id: "m-1",
      content: "We chose PostgreSQL for the memory store.",
      memory_type: "semantic",
      project_id: "p-1",
      confidence: 0.9,
      created_at: "2026-01-10T00:00:00Z",
    },
  ],
  total: 1,
  method: "hybrid",
}));

const mockGetMemory = vi.fn(async (..._args: unknown[]) => ({
  memory_id: "m-1",
  content: "We chose PostgreSQL for the memory store.",
  memory_type: "semantic",
  project_id: "p-1",
  confidence: 0.9,
  created_at: "2026-01-10T00:00:00Z",
}));

const mockListRelated = vi.fn(async (..._args: unknown[]) => ({ items: [] }));

const mockSubmitContribution = vi.fn(async (..._args: unknown[]) => ({
  id: "pr-1",
  status: "proposed",
}));
const mockArchiveContribution = vi.fn(async (..._args: unknown[]) => ({ ok: true }));

const mockContextPackage = vi.fn(async (..._args: unknown[]) => ({
  summary: "Project context summary for test project.",
  memories: [
    {
      memory_id: "m-1",
      content: "We chose PostgreSQL for the memory store.",
      memory_type: "semantic",
    },
  ],
  entities: [{ id: "e-1", name: "PostgreSQL", type: "technology" }],
  decisions: [],
  history: [],
  sources: [{ type: "memory", id: "m-1" }],
  confidence: 0.9,
  retrievedAt: "2026-02-01T00:00:00Z",
}));

const mockProjects = vi.fn(async (..._args: unknown[]) => [{ id: "p-1", name: "Test Project" }]);
const mockInsights = vi.fn(async (..._args: unknown[]) => ({ insights: [] }));
const mockRecentChanges = vi.fn(async (..._args: unknown[]) => ({ changes: [] }));
const mockTimeline = vi.fn(async (..._args: unknown[]) => ({ events: [] }));

const mockLoadPerms = vi.fn(async (..._args: unknown[]) => ({
  agentId: "ag-1",
  workspaceId: "ws-1",
  scopes: ["read:memory", "read:project", "read:graph", "read:usage"],
  memoryTypes: [],
  projectIds: [],
  readOnly: true,
}));

vi.mock("@/server/memory/retrieval", () => ({
  recallMemories: (...a: unknown[]) => mockRecall(...a),
}));
vi.mock("@/server/memory/storage", () => ({
  getMemory: (...a: unknown[]) => mockGetMemory(...a),
}));
vi.mock("@/server/memory/relationships", () => ({
  listRelatedMemories: (...a: unknown[]) => mockListRelated(...a),
}));
vi.mock("@/server/agent/contribution", () => ({
  submitContribution: (...a: unknown[]) => mockSubmitContribution(...a),
  archiveContribution: (...a: unknown[]) => mockArchiveContribution(...a),
}));
vi.mock("@/server/agent/context", () => ({
  buildContextPackage: (...a: unknown[]) => mockContextPackage(...a),
}));
vi.mock("@/server/agent/mcp/shared", () => ({
  loadPerms: (...a: unknown[]) => mockLoadPerms(...a),
  listAuthorizedProjects: (...a: unknown[]) => mockProjects(...a),
  buildInsights: (...a: unknown[]) => mockInsights(...a),
  recentChanges: (...a: unknown[]) => mockRecentChanges(...a),
  recallTimeline: (...a: unknown[]) => mockTimeline(...a),
}));

const principal: AgentPrincipal = {
  userId: "u-1",
  workspaceId: "ws-1",
  agentId: "ag-1",
  name: "Test Agent",
  mode: "read_only",
  category: "coding",
  status: "active",
};

// A minimal, genuine JSON-RPC client speaking the MCP wire protocol over a
// transport. This is the "actual protocol client" exercised in this test.
class MiniClient {
  private transport: InMemoryTransport;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private id = 0;

  constructor(transport: InMemoryTransport) {
    this.transport = transport;
    this.transport.onmessage = (msg: unknown) => this.handle(msg);
  }

  private handle(msg: unknown) {
    if (!msg || typeof msg !== "object") return;
    const m = msg as { id?: number; error?: { message?: string }; result?: unknown };
    if (m.id != null && this.pending.has(m.id)) {
      const { resolve, reject } = this.pending.get(m.id)!;
      this.pending.delete(m.id);
      if (m.error) reject(new Error(m.error.message ?? "rpc error"));
      else resolve(m.result);
    }
  }

  async request(method: string, params: unknown): Promise<unknown> {
    const id = ++this.id;
    const p = new Promise<unknown>((resolve, reject) => this.pending.set(id, { resolve, reject }));
    await this.transport.send({
      jsonrpc: "2.0",
      id,
      method,
      params: (params ?? {}) as Record<string, unknown>,
    } as never);
    return p;
  }

  async notify(method: string, params?: unknown): Promise<void> {
    await this.transport.send({
      jsonrpc: "2.0",
      method,
      params: (params ?? {}) as Record<string, unknown>,
    } as never);
  }
}

let server: McpServer;
let client: MiniClient;

beforeEach(async () => {
  const [cT, sT] = InMemoryTransport.createLinkedPair();
  server = buildMcpServer(principal);
  await server.connect(sT);
  client = new MiniClient(cT);
  await cT.start();
});

afterEach(async () => {
  await server?.close();
});

async function handshake() {
  const init = await client.request("initialize", {
    protocolVersion: LATEST_PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: "test-protocol-client", version: "1.0.0" },
  });
  await client.notify("notifications/initialized");
  return init as { capabilities?: { tools?: unknown; resources?: unknown }; serverInfo?: unknown };
}

describe("MCP server protocol integration (real client against real server)", () => {
  it("performs initialization and capability negotiation", async () => {
    const init = await handshake();
    expect(init.capabilities).toBeTruthy();
    expect(init.capabilities?.tools).toBeTruthy();
    expect(init.capabilities?.resources).toBeTruthy();
    expect(init.serverInfo).toBeTruthy();
  });

  it("discovers all 18 tools", async () => {
    await handshake();
    const res = (await client.request("tools/list", {})) as { tools: { name: string }[] };
    const names = res.tools.map((t) => t.name).sort();
    expect(names).toEqual(
      [
        "search_memories",
        "recall",
        "get_memory",
        "get_related_memories",
        "get_project_context",
        "get_user_preferences",
        "get_timeline",
        "propose_memory",
        "remember",
        "update_memory",
        "link_memories",
        "archive_memory",
        "forget_memory",
        "list_authorized_workspaces",
        "list_projects",
        "get_project_details",
        "get_memory_insights",
        "get_recent_changes",
      ].sort(),
    );
    expect(names).toHaveLength(18);
  });

  it("discovers the workspace resource", async () => {
    await handshake();
    const res = (await client.request("resources/list", {})) as { resources: { uri: string }[] };
    expect(res.resources.some((r) => r.uri.startsWith("mnemosyne://workspace/"))).toBe(true);
  });

  it("executes an authorized tool (search_memories) and returns evidence-grounded result", async () => {
    await handshake();
    const res = (await client.request("tools/call", {
      name: "search_memories",
      arguments: { q: "database choice" },
    })) as { content: { type: string; text?: string }[]; isError?: boolean };
    expect(res.isError).toBeFalsy();
    const text = res.content.map((c) => c.text ?? "").join("");
    expect(text).toContain("m-1");
    expect(mockRecall).toHaveBeenCalledWith("u-1", expect.objectContaining({ workspaceId: "ws-1" }));
  });

  it("executes an authorized read resource (preferences) and returns authorized content", async () => {
    await handshake();
    const uri = "mnemosyne://workspace/ws-1/preferences";
    const res = (await client.request("resources/read", { uri })) as {
      contents: { text?: string; uri?: string }[];
      isError?: boolean;
    };
    expect(res.isError).toBeFalsy();
    expect(res.contents[0]?.text ?? "").toContain("m-1");
  });

  it("rejects a tool when the agent lacks permission (least privilege)", async () => {
    mockLoadPerms.mockResolvedValueOnce({
      agentId: "ag-1",
      workspaceId: "ws-1",
      scopes: [],
      memoryTypes: [],
      projectIds: [],
      readOnly: true,
    });
    await handshake();
    const res = (await client.request("tools/call", {
      name: "search_memories",
      arguments: { q: "database choice" },
    })) as { content: { text?: string }[]; isError?: boolean };
    expect(res.isError).toBe(true);
    const text = res.content.map((c) => c.text ?? "").join("");
    expect(text).toContain("FORBIDDEN");
  });
});
