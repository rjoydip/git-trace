import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { TraceService } from "../core/service";

const json = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});

const failure = (err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  return { content: [{ type: "text" as const, text: `ERROR: ${message}` }], isError: true };
};

/**
 * Build an MCP server over the shared TraceService. Every tool call names its
 * own repository — there is no server-side default.
 */
export function createMcpServer(service: TraceService): McpServer {
  const server = new McpServer({ name: "GitTrace", version: "0.1.0" });

  const repoArg = z.string().describe('Repository as "owner/name" or a GitHub URL');

  const requireRepo = (input?: string): string => {
    const repo = input?.trim();
    if (!repo) throw new Error('No repository given — pass "repo" as "owner/name"');
    return repo;
  };

  const run = <T>(fn: () => Promise<T>) => fn().then(json).catch(failure);

  server.registerTool(
    "trace_repository",
    {
      description: "Summarize a repository: metadata plus commit/author/churn headline stats.",
      inputSchema: { repo: repoArg },
    },
    ({ repo }) =>
      run(async () => {
        const target = requireRepo(repo);
        const [meta, stats] = await Promise.all([service.repo(target), service.stats(target)]);
        return { repository: target, meta, stats };
      }),
  );

  server.registerTool(
    "trace_commits",
    {
      description: "List and search a repository's commits, optionally for a path or author.",
      inputSchema: {
        repo: repoArg,
        path: z.string().optional().describe("Only commits touching this path"),
        author: z.string().optional().describe("GitHub login or email to filter by"),
        q: z.string().optional().describe("Free-text search over subject, author and sha"),
        since: z.string().optional().describe("ISO date; commits on or after"),
        until: z.string().optional().describe("ISO date; commits on or before"),
        limit: z.number().int().min(1).max(100).optional(),
      },
    },
    ({ repo, path, author, q, since, until, limit }) =>
      run(async () => {
        const opts: Parameters<TraceService["commits"]>[1] = {};
        if (path) opts.path = path;
        if (author) opts.author = author;
        if (q) opts.q = q;
        if (since) opts.since = since;
        if (until) opts.until = until;
        if (limit) opts.perPage = limit;
        return { commits: await service.commits(requireRepo(repo), opts) };
      }),
  );

  server.registerTool(
    "trace_contributors",
    {
      description: "Rank contributors by commit count, with avatars and last-commit date.",
      inputSchema: { repo: repoArg },
    },
    ({ repo }) =>
      run(async () => ({ contributors: await service.contributors(requireRepo(repo)) })),
  );

  server.registerTool(
    "trace_hot_files",
    {
      description:
        "Rank files by churn (additions + deletions) across the most recent commits — where the repo changes most.",
      inputSchema: {
        repo: repoArg,
        limit: z.number().int().min(1).max(100).optional(),
      },
    },
    ({ repo, limit }) =>
      run(async () => ({
        files: await service.hotFiles(requireRepo(repo), limit ? { limit } : {}),
      })),
  );

  server.registerTool(
    "trace_file_history",
    {
      description: "Trace one file's history: which commits touched it, with diff stats.",
      inputSchema: {
        repo: repoArg,
        path: z.string().describe("Repository-relative file path"),
        limit: z.number().int().min(1).max(200).optional(),
      },
    },
    ({ repo, path, limit }) =>
      run(async () => ({
        path,
        history: await service.fileHistory(requireRepo(repo), path, limit ? { limit } : {}),
      })),
  );

  server.registerTool(
    "trace_activity",
    {
      description: "Commit activity per calendar day over a window — the repository's pulse.",
      inputSchema: {
        repo: repoArg,
        since: z.string().optional().describe("ISO date; start of the window"),
        until: z.string().optional().describe("ISO date; end of the window"),
        limit: z.number().int().min(1).max(100).optional(),
      },
    },
    ({ repo, since, until, limit }) =>
      run(async () => {
        const opts: Parameters<TraceService["activity"]>[1] = {};
        if (since) opts.since = since;
        if (until) opts.until = until;
        if (limit) opts.limit = limit;
        return { activity: await service.activity(requireRepo(repo), opts) };
      }),
  );

  server.registerTool(
    "trace_pull_request",
    {
      description:
        "Trace one pull request: state, size, labels, review verdicts, its commits and discussion.",
      inputSchema: {
        repo: repoArg,
        number: z.number().int().positive().describe("Pull request number"),
        limit: z.number().int().min(1).max(100).optional().describe("Max timeline entries"),
      },
    },
    ({ repo, number, limit }) =>
      run(async () =>
        service.track(requireRepo(repo), {
          number,
          kind: "pull",
          ...(limit ? { limit } : {}),
        }),
      ),
  );

  server.registerTool(
    "trace_issue",
    {
      description: "Trace one issue: state, labels, author, body and its comment thread.",
      inputSchema: {
        repo: repoArg,
        number: z.number().int().positive().describe("Issue number"),
        limit: z.number().int().min(1).max(100).optional().describe("Max comments"),
      },
    },
    ({ repo, number, limit }) =>
      run(async () =>
        service.track(requireRepo(repo), {
          number,
          kind: "issue",
          ...(limit ? { limit } : {}),
        }),
      ),
  );

  server.registerResource(
    "repository-summary",
    "git-trace://repository/summary",
    { mimeType: "application/json", description: "Repository metadata and headline stats" },
    async () => {
      const target = requireRepo();
      const [meta, stats] = await Promise.all([service.repo(target), service.stats(target)]);
      return {
        contents: [
          {
            uri: "git-trace://repository/summary",
            mimeType: "application/json",
            text: JSON.stringify({ repository: target, meta, stats }, null, 2),
          },
        ],
      };
    },
  );

  server.registerPrompt(
    "history-review",
    {
      description: "Review a repository's recent history for hotspots and risk",
      argsSchema: { repo: z.string().optional() },
    },
    ({ repo }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Trace the recent history of ${repo ?? "the repository the user names"}. Use trace_activity, trace_hot_files and trace_contributors, then summarize: (1) when the repo is most active, (2) which files churn most and likely deserve refactoring or tests, (3) who owns the hot areas, and (4) any gaps worth investigating.`,
          },
        },
      ],
    }),
  );

  return server;
}
