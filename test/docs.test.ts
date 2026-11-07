import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import app from "../src/worker/index";

/**
 * Unlike `docs/cli.md`, these reference docs are hand-written, so there is no
 * generator to diff against. These checks keep them honest: a new route or MCP
 * tool fails the suite until it is documented.
 */
const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const api = read("../docs/api.md");
const mcp = read("../docs/mcp.md");
const server = read("../src/mcp/server.ts");

test("docs/api.md documents every /api route", () => {
  const paths = app.routes
    .map((route) => route.path)
    .filter((path) => path.startsWith("/api/") && !path.includes("*"));
  expect(paths.length).toBeGreaterThanOrEqual(18);
  for (const path of new Set(paths)) {
    expect(api).toContain(path);
  }
});

test("docs/mcp.md documents every MCP tool", () => {
  const names = [...server.matchAll(/server\.registerTool\(\s*"([^"]+)"/g)].map(
    (match) => match[1] ?? "",
  );
  expect(names).toHaveLength(9);
  for (const name of names) {
    expect(mcp).toContain(`\`${name}\``);
  }
});
