/**
 * End-to-end: the real CLI process against a real GitHub emulator. This is the
 * integration the rest of the suite cannot reach — argument parsing, the
 * service, the GitHub client and the renderers, in one shot.
 *
 * The emulator runs in this process, so the CLI is spawned asynchronously: a
 * blocking `spawnSync` would freeze the emulator's event loop and deadlock.
 */
import { afterAll, beforeAll, expect, test } from "bun:test";
import { createEmulator, type Emulator } from "emulate";

const OWNER = "octocat";
const REPO = "cli-fixture";
const TOKEN = "ghp_cli_fixture";

let server: Emulator;
/** The emulator binds 127.0.0.1; `localhost` in a child process can pick ::1. */
let base: string;

const api = (method: string, path: string, body?: unknown) =>
  fetch(`${base}${path}`, {
    method,
    headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

beforeAll(async () => {
  server = await createEmulator({
    service: "github",
    port: 0,
    seed: {
      tokens: { [TOKEN]: { login: OWNER, scopes: ["repo", "user"] } },
      github: {
        users: [{ login: OWNER }],
        repos: [{ owner: OWNER, name: REPO, auto_init: true }],
      },
    },
  });
  base = `http://127.0.0.1:${new URL(server.url).port}`;

  for (const [path, text, message] of [
    ["src/index.ts", "export const a = 1;\n", "feat: add index"],
    ["src/util.ts", "export const b = 2;\n", "feat: add util"],
  ] as const) {
    const res = await api("PUT", `/repos/${OWNER}/${REPO}/contents/${path}`, {
      message,
      content: Buffer.from(text).toString("base64"),
    });
    if (!res.ok) throw new Error(`seed ${path}: ${res.status} ${await res.text()}`);
  }
}, 30_000);

afterAll(async () => {
  await server.close();
});

/** Run the CLI the way a user would: a separate process, no TTY, no stdin. */
async function cli(...args: string[]): Promise<{ code: number; out: string; err: string }> {
  const proc = Bun.spawn(["bun", "src/cli/index.ts", ...args], {
    cwd: process.cwd(),
    env: { ...process.env, GITHUB_TOKEN: TOKEN, GITHUB_API_URL: base },
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
  });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { code, out, err };
}

test("trace --json returns the seeded history", async () => {
  const { code, out } = await cli("trace", `${OWNER}/${REPO}`, "--json");
  expect(code).toBe(0);
  const payload = JSON.parse(out) as { repo: string; commits: unknown[]; hotFiles: unknown[] };
  expect(payload.repo).toBe(`${OWNER}/${REPO}`);
  expect(payload.commits.length).toBeGreaterThanOrEqual(3);
  expect(payload.hotFiles.length).toBeGreaterThan(0);
});

test("piped output is Markdown, --text is aligned", async () => {
  const md = await cli("commits", `${OWNER}/${REPO}`);
  expect(md.code).toBe(0);
  expect(md.out).toContain("| when | sha | author | subject |");
  expect(md.out).not.toContain("\x1b[");

  const text = await cli("commits", `${OWNER}/${REPO}`, "--text");
  expect(text.code).toBe(0);
  expect(text.out).not.toContain("| when |");
});

test("doctor probes every read path and exits 0", async () => {
  const { code, out } = await cli("doctor", `${OWNER}/${REPO}`);
  expect(code).toBe(0);
  expect(out).toContain("All checks passed");
});

test("a missing repository exits 1 with the API's message", async () => {
  const { code, err } = await cli("trace", `${OWNER}/does-not-exist`);
  expect(code).toBe(1);
  expect(err.trim().length).toBeGreaterThan(0);
});

test("a bad flag exits 2 before any request", async () => {
  const { code, err } = await cli("activity", `${OWNER}/${REPO}`, "--interval", "1");
  expect(code).toBe(2);
  expect(err).toContain("--interval");
});
