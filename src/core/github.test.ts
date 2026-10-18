import { afterEach, describe, expect, test } from "bun:test";
import { GitHubClient } from "./github";

interface FakeCache {
  match(request: string): Promise<Response | undefined>;
  put(request: string, response: Response): Promise<void>;
}

function fakeCache(): FakeCache {
  const store = new Map<string, Response>();
  return {
    match: async (request) => store.get(request)?.clone(),
    put: async (request, response) => {
      store.set(request, response);
    },
  };
}

/** Assigning to globals needs a cast; keep it out of the test bodies. */
const globals = globalThis as unknown as { fetch: typeof fetch; caches?: { default: FakeCache } };
const originalFetch = globals.fetch;
const originalCaches = globals.caches;

function repoJson(): string {
  return JSON.stringify({
    full_name: "a/b",
    description: null,
    stargazers_count: 1,
    forks_count: 0,
    open_issues_count: 0,
    default_branch: "main",
    language: "TypeScript",
    html_url: "https://github.com/a/b",
  });
}

describe("GitHubClient edge cache", () => {
  afterEach(() => {
    globals.fetch = originalFetch;
    globals.caches = originalCaches;
  });

  test("serves a repeated GET from cache without hitting the network", async () => {
    let calls = 0;
    globals.fetch = (async () => {
      calls += 1;
      return new Response(repoJson(), { headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch;
    globals.caches = { default: fakeCache() };

    const client = new GitHubClient({ baseUrl: "https://api.test" });
    const first = await client.getRepo({ owner: "a", name: "b" });
    const second = await client.getRepo({ owner: "a", name: "b" });

    expect(calls).toBe(1);
    expect(first.fullName).toBe("a/b");
    expect(second.fullName).toBe("a/b");
  });

  test("never caches errors, so a rate limit is not sticky", async () => {
    let calls = 0;
    globals.fetch = (async () => {
      calls += 1;
      return new Response(JSON.stringify({ message: "API rate limit exceeded" }), {
        status: 403,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;
    globals.caches = { default: fakeCache() };

    const client = new GitHubClient({ baseUrl: "https://api.test" });
    await expect(client.getRepo({ owner: "a", name: "b" })).rejects.toThrow("rate limit");
    await expect(client.getRepo({ owner: "a", name: "b" })).rejects.toThrow("rate limit");
    expect(calls).toBe(2);
  });

  test("caching can be disabled", async () => {
    let calls = 0;
    globals.fetch = (async () => {
      calls += 1;
      return new Response(repoJson(), { headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch;
    globals.caches = { default: fakeCache() };

    const client = new GitHubClient({ baseUrl: "https://api.test", cacheTtlSeconds: 0 });
    await client.getRepo({ owner: "a", name: "b" });
    await client.getRepo({ owner: "a", name: "b" });
    expect(calls).toBe(2);
  });

  test("an issue number that is really a pull request is rejected with a hint", async () => {
    globals.fetch = (async () =>
      new Response(
        JSON.stringify({
          number: 7,
          title: "t",
          body: null,
          state: "open",
          user: null,
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
          closed_at: null,
          html_url: "https://github.com/a/b/issues/7",
          pull_request: { url: "https://api.github.com/…" },
        }),
        { headers: { "content-type": "application/json" } },
      )) as unknown as typeof fetch;
    globals.caches = undefined;

    const client = new GitHubClient({ baseUrl: "https://api.test", cacheTtlSeconds: 0 });
    await expect(client.getIssue({ owner: "a", name: "b" }, 7)).rejects.toThrow(
      'switch the kind to "pull"',
    );
  });

  test("a token gets its own cache entry, so private data never leaks across tokens", async () => {
    let calls = 0;
    globals.fetch = (async () => {
      calls += 1;
      return new Response(repoJson(), { headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch;
    globals.caches = { default: fakeCache() };

    const anon = new GitHubClient({ baseUrl: "https://api.test" });
    const alice = new GitHubClient({ baseUrl: "https://api.test", token: "alice" });
    const alsoAlice = new GitHubClient({ baseUrl: "https://api.test", token: "alice" });

    await anon.getRepo({ owner: "a", name: "b" });
    await alice.getRepo({ owner: "a", name: "b" });
    await alsoAlice.getRepo({ owner: "a", name: "b" });

    expect(calls).toBe(2);
  });
});

describe("listItems", () => {
  afterEach(() => {
    globals.fetch = originalFetch;
    globals.caches = originalCaches;
  });

  test("splits pull requests from issues and reports merged state", async () => {
    globals.fetch = (async () =>
      new Response(
        JSON.stringify([
          {
            number: 12,
            title: "a merged pull",
            body: null,
            state: "closed",
            user: { login: "alice", avatar_url: null },
            labels: [{ name: "bug", color: "ff0000" }],
            comments: 3,
            created_at: "2024-01-01T00:00:00Z",
            updated_at: "2024-02-01T00:00:00Z",
            closed_at: "2024-02-01T00:00:00Z",
            html_url: "https://github.com/a/b/pull/12",
            pull_request: { url: "https://api.github.com/…", merged_at: "2024-02-01T00:00:00Z" },
          },
          {
            number: 9,
            title: "an open issue",
            body: "text",
            state: "open",
            user: null,
            created_at: "2024-01-01T00:00:00Z",
            updated_at: "2024-01-02T00:00:00Z",
            closed_at: null,
            html_url: "https://github.com/a/b/issues/9",
          },
        ]),
        { headers: { "content-type": "application/json" } },
      )) as unknown as typeof fetch;
    globals.caches = undefined;

    const client = new GitHubClient({ baseUrl: "https://api.test", cacheTtlSeconds: 0 });
    const items = await client.listItems({ owner: "a", name: "b" }, { state: "all" });

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ kind: "pull", number: 12, merged: true, comments: 3 });
    expect(items[0]?.labels).toEqual([{ name: "bug", color: "ff0000" }]);
    // No `user` on the wire still has to render.
    expect(items[1]).toMatchObject({ kind: "issue", number: 9, merged: false });
    expect(items[1]?.author.login).toBe("ghost");
  });
});
