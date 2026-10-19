import { afterEach, expect, test } from "bun:test";
import { TraceService } from "./service";

/**
 * Cloudflare counts Cache API `match`/`put` against the same per-invocation
 * budget as `fetch` — 50 on the Free plan. These tests pin the fan-out so a
 * future change cannot quietly push a cold trace back over the cliff.
 */

const realFetch = globalThis.fetch;
const realCaches = (globalThis as { caches?: unknown }).caches;
let ops = 0;
let fetchCalls = 0;
const store = new Map<string, Response>();

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

const repo = {
  full_name: "o/r",
  description: "d",
  stargazers_count: 1,
  forks_count: 1,
  open_issues_count: 0,
  default_branch: "main",
  language: "TS",
  html_url: "https://github.com/o/r",
};

const commits = Array.from({ length: 100 }, (_, i) => ({
  sha: String(i).padStart(40, "a"),
  html_url: "https://github.com/o/r/commit/x",
  commit: {
    message: `m${i}`,
    author: { name: "a", email: "a@b", date: "2026-01-01T00:00:00Z" },
  },
  author: { login: "a", avatar_url: "" },
  parents: [],
}));

const detail = (sha: string) => ({
  sha,
  html_url: "u",
  commit: { message: "m", author: { name: "a", email: "a@b", date: "2026-01-01T00:00:00Z" } },
  author: { login: "a", avatar_url: "" },
  parents: [],
  stats: { additions: 1, deletions: 1, total: 2 },
  files: [
    { filename: "f.ts", status: "modified", additions: 1, deletions: 1, changes: 2, patch: "@@" },
  ],
});

const install = () => {
  ops = 0;
  fetchCalls = 0;
  store.clear();
  globalThis.fetch = (async (input: string | URL | Request) => {
    fetchCalls++;
    ops++;
    const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(href);
    const path = url.pathname;
    let body: unknown = {};
    if (path === "/repos/o/r") body = repo;
    else if (path.endsWith("/contributors")) body = [];
    else if (path === "/repos/o/r/commits") {
      body = commits.slice(0, Number(url.searchParams.get("per_page") ?? 30));
    } else if (/\/commits\/[^/]+$/.test(path)) body = detail(path.split("/").pop() ?? "");
    return json(body);
  }) as typeof fetch;
  Object.defineProperty(globalThis, "caches", {
    configurable: true,
    value: {
      default: {
        match: async (key: string) => {
          ops++;
          return store.get(key)?.clone();
        },
        put: async (key: string, res: Response) => {
          ops++;
          store.set(key, res.clone());
        },
      },
    },
  });
};

afterEach(() => {
  globalThis.fetch = realFetch;
  if (realCaches === undefined) delete (globalThis as { caches?: unknown }).caches;
  else Object.defineProperty(globalThis, "caches", { configurable: true, value: realCaches });
});

test("a cold trace fits the Free plan's 50-subrequest budget", async () => {
  install();
  const service = new TraceService({ token: "t", cacheTtlSeconds: 300 });
  await service.trace("o/r");
  expect(fetchCalls).toBe(33); // repo + commit list + contributors + 30 details
  expect(ops).toBeLessThanOrEqual(50);
});

test("a warm trace reads only cache", async () => {
  install();
  const service = new TraceService({ token: "t", cacheTtlSeconds: 300 });
  await service.trace("o/r");
  ops = 0;
  fetchCalls = 0;
  await service.trace("o/r");
  expect(fetchCalls).toBe(0);
  expect(ops).toBeLessThanOrEqual(5);
});

test("file history reuses the batched detail cache", async () => {
  install();
  const service = new TraceService({ token: "t", cacheTtlSeconds: 300 });
  await service.trace("o/r");
  ops = 0;
  fetchCalls = 0;
  await service.fileHistory("o/r", "f.ts");
  // Only the per-page-30 commit list is new; the details come from the batch.
  expect(fetchCalls).toBe(1);
  expect(ops).toBeLessThanOrEqual(5);
});
