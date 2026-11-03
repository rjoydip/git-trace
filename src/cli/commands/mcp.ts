/**
 * The MCP tabs: the Simulator's tool list and tool calls, and the client config
 * the Docs tab shows. Both run against the same `createMcpServer` the Worker
 * hosts, over an in-memory transport — no Worker, no network.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../../mcp/server";
import type { TraceService } from "../../core/service";
import { packageVersion } from "../config";
import { stringValue, UsageError, type Command, type RunContext } from "../args";
import { formatTable, write, writeJson } from "../render";

/** The snippet a client pastes into its MCP config. */
export function mcpConfig(url: string): unknown {
  return {
    mcpServers: {
      "git-trace": { type: "http", url: `${url.replace(/\/+$/, "")}/mcp` },
    },
  };
}

export function serverUrl(values: RunContext["values"]): string {
  return stringValue(values.url) ?? process.env.GIT_TRACE_URL ?? "http://127.0.0.1:8787";
}

/** Connect an in-memory client to a fresh server, and always tear both down. */
async function withClient<T>(
  service: TraceService,
  run: (client: Client) => Promise<T>,
): Promise<T> {
  const server = createMcpServer(service);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "git-trace-cli", version: packageVersion() });
  await client.connect(clientTransport);
  try {
    return await run(client);
  } finally {
    await client.close().catch(() => undefined);
    await server.close().catch(() => undefined);
  }
}

export const mcp: Command = {
  name: "mcp",
  summary: "MCP tools and client config (list, call, config)",
  usage: "git-trace mcp <list|call|config> [tool] [--args <json>] [--url <origin>]",
  options: {
    args: { type: "string", value: "<json>", description: "Tool arguments as JSON (call)" },
    raw: { type: "boolean", description: "Print the whole JSON-RPC result envelope" },
    url: { type: "string", value: "<origin>", description: "Server origin for `config`" },
  },

  async run({ service, values, positionals, markdown }) {
    const sub = positionals[0];
    if (sub === "config") {
      writeJson(mcpConfig(serverUrl(values)));
      return;
    }

    if (sub === "list") {
      const tools = await withClient(service, async (client) => (await client.listTools()).tools);
      if (values.json) {
        writeJson(tools);
        return;
      }
      write(
        formatTable(
          tools.map((tool) => [
            tool.name,
            requiredArgs(tool.inputSchema),
            firstLine(tool.description ?? ""),
          ]),
          markdown,
          ["tool", "args", "description"],
        ).join("\n"),
      );
      return;
    }

    if (sub === "call") {
      const name = positionals[1];
      if (!name) {
        throw new UsageError("A tool is required: git-trace mcp call <tool> [--args <json>]");
      }
      const args = parseJsonObject(stringValue(values.args));
      const result = await withClient(service, (client) =>
        client.callTool({ name, arguments: args }),
      );
      writeJson(values.raw === true ? result : unwrap(result));
      return;
    }

    throw new UsageError(`mcp: unknown subcommand "${sub ?? ""}" (list, call, config)`);
  },
};

function requiredArgs(schema: unknown): string {
  const required = (schema as { required?: unknown })?.required;
  return Array.isArray(required) && required.length > 0 ? required.join(", ") : "—";
}

function firstLine(text: string): string {
  const line = text.split("\n")[0] ?? "";
  return line.length > 80 ? `${line.slice(0, 79)}…` : line;
}

function parseJsonObject(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new UsageError('--args must be valid JSON, e.g. --args \'{"repo":"a/b"}\'');
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new UsageError("--args must be a JSON object");
  }
  return parsed as Record<string, unknown>;
}

/** A tool result is `{ content: [{ type: "text", text }] }`; unwrap the first text block. */
function unwrap(result: unknown): unknown {
  const content = (result as { content?: unknown })?.content;
  if (!Array.isArray(content)) return result;
  for (const block of content) {
    const text = (block as { text?: unknown })?.text;
    if (typeof text !== "string") continue;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  return result;
}
