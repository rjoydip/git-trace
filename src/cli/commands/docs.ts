/**
 * The Docs tab: what this deployment is, and the client config an MCP host
 * needs. Offline — it describes the contract, not a live server.
 */
import type { Command } from "../args";
import { mcpConfig, serverUrl } from "./mcp";
import { write, writeJson } from "../render";

const FACTS = [
  ["endpoints", "/api/* (JSON) · /mcp (MCP, Streamable HTTP, stateless)"],
  ["runtime", "Cloudflare Workers · no database · GitHub REST on read"],
  ["cache", "edge, per request via x-cache-ttl, 0 disables it"],
] as const;

export const docs: Command = {
  name: "docs",
  summary: "Endpoints, runtime facts and the MCP client config",
  usage: "git-trace docs [--url <origin>]",
  options: {
    url: { type: "string", value: "<origin>", description: "Server origin for the MCP config" },
  },

  async run({ values, markdown }) {
    const config = mcpConfig(serverUrl(values));

    if (values.json) {
      writeJson({ facts: Object.fromEntries(FACTS), mcp: config });
      return;
    }

    if (markdown) {
      write(
        [
          "**git-trace** — one Worker, three adapters: dashboard, JSON API, MCP",
          "",
          ...FACTS.map(([label, text]) => `- **${label}** ${text}`),
          "",
          "MCP client config:",
          "",
          "```json",
          JSON.stringify(config, null, 2),
          "```",
          "",
          "Run `git-trace --help` for commands, `git-trace help <command>` for options.",
        ].join("\n"),
      );
      return;
    }

    const width = Math.max(...FACTS.map(([label]) => label.length));
    write(
      [
        "git-trace — one Worker, three adapters: dashboard, JSON API, MCP",
        "",
        ...FACTS.map(([label, text]) => `  ${label.padEnd(width)}  ${text}`),
        "",
        "MCP client config:",
        ...JSON.stringify(config, null, 2)
          .split("\n")
          .map((line) => `  ${line}`),
        "",
        "Run `git-trace --help` for commands, `git-trace help <command>` for options.",
      ].join("\n"),
    );
  },
};
