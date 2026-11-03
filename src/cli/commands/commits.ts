/**
 * Commit-shaped commands: the timeline, one commit, and the message feed the
 * Comments tab shows (which is the same commits with their bodies).
 */
import type { ListCommitsOptions } from "../../core/github";
import { choiceFlag, numberFlag, repoOf, stringValue, UsageError, type Command } from "../args";
import { renderCommit, renderComments, renderCommits, write, writeJson } from "../render";

const LIMIT = { min: 1, max: 100 } as const;

/** Every filter the commits endpoint understands, read off the flags. */
function commitOptions(values: Record<string, string | boolean | undefined>, limit: number) {
  const options: ListCommitsOptions & { q?: string } = { perPage: limit };
  for (const flag of ["path", "author", "since", "until", "sha", "q"] as const) {
    const value = stringValue(values[flag]);
    if (value) options[flag] = value;
  }
  return options;
}

export const commits: Command = {
  name: "commits",
  summary: "Commit timeline, filterable by path, author, text and date",
  usage: "git-trace commits <owner/name> [--path <p>] [--author <u>] [--q <text>] [--body]",
  options: {
    path: { type: "string", value: "<path>", description: "Only commits touching this path" },
    author: { type: "string", value: "<login>", description: "Only commits by this user" },
    since: { type: "string", value: "<date>", description: "ISO date or YYYY-MM-DD" },
    until: { type: "string", value: "<date>", description: "ISO date or YYYY-MM-DD" },
    sha: { type: "string", value: "<ref>", description: "Branch or tag to walk" },
    q: { type: "string", value: "<text>", description: "Substring over message, author and sha" },
    order: { type: "string", value: "<newest|oldest>", description: "Default newest" },
    body: { type: "boolean", description: "Print full commit messages" },
    limit: { type: "string", short: "n", value: "<n>", description: "Rows (default 30, max 100)" },
  },

  async run({ service, values, positionals, colour, markdown }) {
    const repo = repoOf(values, positionals);
    const order = choiceFlag(values, "order", ["newest", "oldest"] as const, "newest");
    const limit = numberFlag(values, "limit", LIMIT) ?? 30;
    const commits = await service.commits(repo, commitOptions(values, limit));
    const rows = order === "oldest" ? [...commits].reverse() : commits;

    if (values.json) writeJson(rows);
    else write(renderCommits(rows, { colour, markdown, body: values.body === true }));
  },
};

export const commit: Command = {
  name: "commit",
  summary: "One commit: message, stats and changed files",
  usage: "git-trace commit <owner/name> <sha>",
  options: {},

  async run({ service, values, positionals, colour, markdown }) {
    const repo = repoOf(values, positionals);
    const sha = positionals[1];
    if (!sha) throw new UsageError("A commit is required: git-trace commit <owner/name> <sha>");
    const detail = await service.commit(repo, sha);

    if (values.json) writeJson(detail);
    else write(renderCommit(detail, { colour, markdown }));
  },
};

export const comments: Command = {
  name: "comments",
  summary: "Full commit messages, newest first",
  usage: "git-trace comments <owner/name> [--author <u>] [--order newest|oldest]",
  options: {
    author: { type: "string", value: "<login>", description: "Only this author" },
    order: { type: "string", value: "<newest|oldest>", description: "Default newest" },
    limit: { type: "string", short: "n", value: "<n>", description: "Rows (default 30, max 100)" },
  },

  async run({ service, values, positionals, colour, markdown }) {
    const repo = repoOf(values, positionals);
    const order = choiceFlag(values, "order", ["newest", "oldest"] as const, "newest");
    const limit = numberFlag(values, "limit", LIMIT) ?? 30;
    const commits = await service.commits(repo, commitOptions(values, limit));
    const rows = order === "oldest" ? [...commits].reverse() : commits;

    if (values.json) writeJson(rows);
    else write(renderComments(rows, { colour, markdown }));
  },
};
