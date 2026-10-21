import { expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "./server";
import type { TraceService } from "../core/service";

test("exposes trace_items and resolves the repository-summary template", async () => {
  const calls: string[] = [];
  const service = {
    items: async (repo: string) => {
      calls.push(`items:${repo}`);
      return [{ kind: "pull", number: 7, title: "Fix it" }];
    },
    repo: async (repo: string) => {
      calls.push(`repo:${repo}`);
      return { fullName: repo };
    },
    stats: async (repo: string) => {
      calls.push(`stats:${repo}`);
      return { commits: 1 };
    },
  } as unknown as TraceService;

  const server = createMcpServer(service);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "test", version: "0.0.0" });
  await client.connect(clientTransport);

  try {
    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toContain("trace_items");

    const items = (await client.callTool({
      name: "trace_items",
      arguments: { repo: "owner/repo", state: "closed", limit: 5 },
    })) as { content: Array<{ text: string }> };
    expect(JSON.parse(items.content[0]!.text)).toEqual({
      items: [{ kind: "pull", number: 7, title: "Fix it" }],
    });

    const resource = await client.readResource({
      uri: "git-trace://repository/owner/repo/summary",
    });
    const payload = JSON.parse((resource.contents[0] as { text: string }).text);
    expect(payload.repository).toBe("owner/repo");
    expect(calls).toEqual(["items:owner/repo", "repo:owner/repo", "stats:owner/repo"]);
  } finally {
    await client.close();
    await server.close();
  }
});
