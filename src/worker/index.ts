import { Hono, type Context } from "hono";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createMcpServer } from "../mcp/server";
import { GitHubError } from "../core/github";
import { DEFAULT_CACHE_TTL_SECONDS } from "../core/github";
import { isInlineMedia, mediaType } from "../core/media";
import { TraceService, type TraceServiceOptions } from "../core/service";

interface Env {
  /** Static-assets binding. Typed minimally so DOM and Workers libs don't clash. */
  ASSETS: { fetch: (request: Request) => Promise<Response> };
}

const app = new Hono<{ Bindings: Env }>();

/** Header carrying a bring-your-own token. Mirrors `TOKEN_HEADER` in `src/web/lib/token.ts`. */
const TOKEN_HEADER = "x-github-token";

/** Header carrying a bring-your-own edge-cache TTL, in seconds. Mirrors `CACHE_TTL_HEADER`. */
const CACHE_TTL_HEADER = "x-cache-ttl";

type AppContext = Context<{ Bindings: Env }>;

/**
 * Edge-cache TTL for this request. The dashboard sends its own preference;
 * anything else — MCP clients included — gets the default. 0 disables caching.
 */
const cacheTtl = (c: AppContext): number => {
  const raw = c.req.header(CACHE_TTL_HEADER);
  const ttl = Number(raw);
  return raw !== undefined && raw !== "" && Number.isFinite(ttl) && ttl >= 0
    ? ttl
    : DEFAULT_CACHE_TTL_SECONDS;
};

/**
 * Builds a service for one request. The token is the caller's own, sent as a
 * header from the dashboard's settings: this deployment stores no GitHub
 * credentials at all, so an anonymous caller simply gets GitHub's anonymous
 * quota and cannot reach private repositories.
 */
const serviceFor = (c: AppContext) => {
  const options: TraceServiceOptions = { cacheTtlSeconds: cacheTtl(c) };
  const token = c.req.header(TOKEN_HEADER)?.trim();
  if (token) options.token = token;
  return new TraceService(options);
};

/** Every request names its own repository — there is no server-side default. */
const repoOf = (query: string | undefined): string => {
  const repo = query?.trim();
  if (!repo) {
    throw new GitHubError(400, "No repository: pass ?repo=owner/name");
  }
  return repo;
};

/** A file name safe to drop inside a header — a quote or newline would break it. */
const safeFileName = (path: string): string =>
  path.slice(path.lastIndexOf("/") + 1).replace(/[^\w.\- ]/g, "_") || "file";

/** Maps thrown errors to JSON responses with honest status codes. */
const fail = (c: { json: (body: unknown, status: number) => Response }, err: unknown): Response => {
  if (err instanceof GitHubError) {
    return c.json({ error: err.message, status: err.status }, err.status);
  }
  return c.json({ error: err instanceof Error ? err.message : String(err), status: 500 }, 500);
};

app.get("/api/health", (c) => c.json({ status: "ok", timestamp: new Date().toISOString() }));

app.get("/api/config", (c) =>
  c.json({
    /** What a caller that sends no `x-cache-ttl` gets. */
    cacheTtlSeconds: DEFAULT_CACHE_TTL_SECONDS,
  }),
);

// The dashboard's one-shot endpoint: everything it renders, from a single pass.
app.get("/api/trace", async (c) => {
  try {
    const repo = repoOf(c.req.query("repo"));
    return c.json(await serviceFor(c).trace(repo));
  } catch (err) {
    return fail(c, err);
  }
});

app.get("/api/repo", async (c) => {
  try {
    const repo = repoOf(c.req.query("repo"));
    return c.json(await serviceFor(c).repo(repo));
  } catch (err) {
    return fail(c, err);
  }
});

app.get("/api/stats", async (c) => {
  try {
    const repo = repoOf(c.req.query("repo"));
    const limit = Number(c.req.query("limit"));
    return c.json(
      await serviceFor(c).stats(repo, Number.isFinite(limit) && limit > 0 ? { limit } : {}),
    );
  } catch (err) {
    return fail(c, err);
  }
});

app.get("/api/commits", async (c) => {
  try {
    const repo = repoOf(c.req.query("repo"));
    const limit = Number(c.req.query("limit"));
    const opts: Parameters<TraceService["commits"]>[1] = {};
    if (Number.isFinite(limit) && limit > 0) opts.perPage = limit;
    const path = c.req.query("path");
    if (path) opts.path = path;
    const author = c.req.query("author");
    if (author) opts.author = author;
    const q = c.req.query("q");
    if (q) opts.q = q;
    return c.json({ commits: await serviceFor(c).commits(repo, opts) });
  } catch (err) {
    return fail(c, err);
  }
});

app.get("/api/contributors", async (c) => {
  try {
    const repo = repoOf(c.req.query("repo"));
    return c.json({ contributors: await serviceFor(c).contributors(repo) });
  } catch (err) {
    return fail(c, err);
  }
});

app.get("/api/hot-files", async (c) => {
  try {
    const repo = repoOf(c.req.query("repo"));
    const limit = Number(c.req.query("limit"));
    return c.json({
      files: await serviceFor(c).hotFiles(
        repo,
        Number.isFinite(limit) && limit > 0 ? { limit } : {},
      ),
    });
  } catch (err) {
    return fail(c, err);
  }
});

app.get("/api/file-history", async (c) => {
  try {
    const repo = repoOf(c.req.query("repo"));
    const path = c.req.query("path");
    if (!path) throw new GitHubError(400, "path is required");
    return c.json({ path, history: await serviceFor(c).fileHistory(repo, path) });
  } catch (err) {
    return fail(c, err);
  }
});

app.get("/api/diff", async (c) => {
  try {
    const repo = repoOf(c.req.query("repo"));
    const path = c.req.query("path");
    if (!path) throw new GitHubError(400, "path is required");
    const limit = Number(c.req.query("limit"));
    return c.json({
      path,
      diffs: await serviceFor(c).fileDiffs(
        repo,
        path,
        Number.isFinite(limit) && limit > 0 ? { limit } : {},
      ),
    });
  } catch (err) {
    return fail(c, err);
  }
});

app.get("/api/tree", async (c) => {
  try {
    const repo = repoOf(c.req.query("repo"));
    const ref = c.req.query("ref");
    return c.json(await serviceFor(c).tree(repo, ref ? { ref } : {}));
  } catch (err) {
    return fail(c, err);
  }
});

app.get("/api/refs", async (c) => {
  try {
    const repo = repoOf(c.req.query("repo"));
    return c.json(await serviceFor(c).refs(repo));
  } catch (err) {
    return fail(c, err);
  }
});

app.get("/api/tag", async (c) => {
  try {
    const repo = repoOf(c.req.query("repo"));
    const tag = c.req.query("tag");
    if (!tag) throw new GitHubError(400, "tag is required");
    return c.json(await serviceFor(c).tag(repo, tag));
  } catch (err) {
    return fail(c, err);
  }
});

app.get("/api/file", async (c) => {
  try {
    const repo = repoOf(c.req.query("repo"));
    const path = c.req.query("path");
    if (!path) throw new GitHubError(400, "path is required");
    return c.json(await serviceFor(c).file(repo, path, c.req.query("ref")));
  } catch (err) {
    return fail(c, err);
  }
});

app.get("/api/raw", async (c) => {
  try {
    const repo = repoOf(c.req.query("repo"));
    const path = c.req.query("path");
    if (!path) throw new GitHubError(400, "path is required");
    const upstream = await serviceFor(c).raw(repo, path, c.req.query("ref"));
    const type = mediaType(path);
    return new Response(upstream.body, {
      headers: {
        "content-type": type,
        // Media renders in place; anything else downloads, so a repository's
        // HTML can never execute on this origin even if opened directly.
        "content-disposition": `${isInlineMedia(type) ? "inline" : "attachment"}; filename="${safeFileName(path)}"`,
        "x-content-type-options": "nosniff",
        // Private: the browser may cache it, shared caches may not.
        "cache-control": `private, max-age=${cacheTtl(c)}`,
      },
    });
  } catch (err) {
    return fail(c, err);
  }
});

app.get("/api/track", async (c) => {
  try {
    const repo = repoOf(c.req.query("repo"));
    const raw = c.req.query("number");
    if (!raw) throw new GitHubError(400, "number is required");
    const number = Number(raw);
    if (!Number.isInteger(number) || number <= 0) {
      throw new GitHubError(400, `Not a pull request or issue number: "${raw}"`);
    }
    const opts: Parameters<TraceService["track"]>[1] = {
      number,
      kind: c.req.query("kind") === "issue" ? "issue" : "pull",
    };
    const limit = Number(c.req.query("limit"));
    if (Number.isFinite(limit) && limit > 0) opts.limit = limit;
    return c.json(await serviceFor(c).track(repo, opts));
  } catch (err) {
    return fail(c, err);
  }
});

app.get("/api/activity", async (c) => {
  try {
    const repo = repoOf(c.req.query("repo"));
    const opts: Parameters<TraceService["activity"]>[1] = {};
    const since = c.req.query("since");
    if (since) opts.since = since;
    const until = c.req.query("until");
    if (until) opts.until = until;
    const limit = Number(c.req.query("limit"));
    if (Number.isFinite(limit) && limit > 0) opts.limit = limit;
    return c.json({ activity: await serviceFor(c).activity(repo, opts) });
  } catch (err) {
    return fail(c, err);
  }
});

app.get("/api/items", async (c) => {
  try {
    const repo = repoOf(c.req.query("repo"));
    const raw = c.req.query("state");
    const opts: Parameters<TraceService["items"]>[1] = {
      state: raw === "closed" || raw === "all" ? raw : "open",
    };
    const limit = Number(c.req.query("limit"));
    if (Number.isFinite(limit) && limit > 0) opts.limit = limit;
    return c.json({ items: await serviceFor(c).items(repo, opts) });
  } catch (err) {
    return fail(c, err);
  }
});

// MCP over Streamable HTTP. Stateless: one server+transport per request, so a
// Worker isolate can serve any client without sticky sessions.
app.all("/mcp", async (c) => {
  const server = createMcpServer(serviceFor(c));
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return transport.handleRequest(c.req.raw);
});

// Unknown API paths must return JSON, not the SPA's index.html.
app.all("/api/*", (c) => c.json({ error: "Not found" }, 404));

// Safety net for local dev / preview: anything else is a static asset.
app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
