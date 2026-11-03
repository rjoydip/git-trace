import { expect, test } from "bun:test";
import type { TracePayload } from "../src/core/service";
import type { Commit, CommitDetail, RepoTree } from "../src/core/types";
import {
  renderActivity,
  renderCommit,
  renderCommits,
  renderTrace,
  renderTree,
} from "../src/cli/render";

const commit: Commit = {
  sha: "6650f6c172385bd2e397e87c88d8f2cad453d700",
  shortSha: "6650f6c",
  message: "refactor: re-export util\n\nKeeps the import in one place.",
  subject: "refactor: re-export util",
  author: { name: "mona", email: "mona@localhost", login: "mona" },
  date: "2026-11-01T18:28:00.000Z",
  url: "https://example.test/commit",
  parents: [],
};

const payload: TracePayload = {
  repo: "octocat/trace-demo",
  meta: {
    fullName: "octocat/trace-demo",
    description: "Seeded history",
    stars: 3,
    forks: 1,
    openIssues: 0,
    defaultBranch: "main",
    language: "TypeScript",
    url: "https://example.test",
  },
  stats: {
    commits: 7,
    authors: 3,
    filesTouched: 3,
    additions: 14,
    deletions: 2,
    firstCommit: "2026-10-13T00:00:00.000Z",
    lastCommit: "2026-11-02T00:00:00.000Z",
  },
  commits: [commit],
  contributors: [
    { name: "mona", email: "mona@localhost", login: "mona", commits: 2, lastCommit: commit.date },
  ],
  hotFiles: [{ path: "src/index.ts", commits: 3, additions: 5, deletions: 2, churn: 7 }],
  activity: [
    { date: "2026-11-01", count: 2 },
    { date: "2026-11-02", count: 0 },
  ],
  fileGraph: { nodes: [], links: [] },
};

test("the overview report carries the headline numbers and both rankings", () => {
  const text = renderTrace(payload, { colour: false });
  expect(text).toContain("octocat/trace-demo");
  expect(text).toContain("Commits  7  Oct 13 → Nov 2");
  expect(text).toContain("Churn    +14 −2");
  expect(text).toContain("Contributors");
  expect(text).toContain("src/index.ts");
  expect(text).not.toContain("\x1b[");
});

test("colour is opt-in and never leaks into the plain report", () => {
  expect(renderTrace(payload, { colour: true })).toContain("\x1b[");
  expect(renderTrace(payload, { colour: false })).not.toContain("\x1b[");
});

test("commits align into one table and reverse on request", () => {
  const text = renderCommits([commit], { colour: false });
  expect(text).toContain("6650f6c");
  expect(text).toContain("mona");
  expect(text).toContain("refactor: re-export util");
});

test("--body switches to the message feed", () => {
  const text = renderCommits([commit], { colour: false, body: true });
  expect(text).toContain("Keeps the import in one place.");
});

test("one commit lists its files and stats", () => {
  const detail: CommitDetail = {
    ...commit,
    files: [{ filename: "src/index.ts", status: "modified", additions: 1, deletions: 0 }],
    stats: { additions: 1, deletions: 0, total: 1 },
  };
  const text = renderCommit(detail, { colour: false });
  expect(text).toContain("+1 −0");
  expect(text).toContain("src/index.ts");
  expect(text).toContain("M  src/index.ts");
});

test("the activity bar draws nothing for a zero day", () => {
  const text = renderActivity(payload.activity, { colour: false, bar: true });
  const zero = text.split("\n").find((line) => line.includes("2026-11-02"));
  expect(zero).toBeDefined();
  expect(zero).not.toContain("▇");
});

test("the tree draws branches, not a flat list", () => {
  const listing: RepoTree = {
    repo: "octocat/trace-demo",
    ref: "main",
    truncated: false,
    entries: [
      { path: "README.md", type: "blob", size: 20, sha: "b" },
      { path: "src", type: "tree", size: 0, sha: "a" },
      { path: "src/index.ts", type: "blob", size: 10, sha: "c" },
      { path: "src/util.ts", type: "blob", size: 10, sha: "d" },
    ],
  };
  const text = renderTree(listing, { colour: false });
  expect(text).toContain("4 entries");
  expect(text).toContain("├── README.md");
  expect(text).toContain("└── src/");
  expect(text).toContain("    ├── index.ts");
  expect(text).toContain("    └── util.ts");
  expect(text).not.toContain("- README.md");
});

test("markdown mode fences the tree so the glyphs survive", () => {
  const listing: RepoTree = {
    repo: "octocat/trace-demo",
    ref: "main",
    truncated: false,
    entries: [{ path: "src/index.ts", type: "blob", size: 10, sha: "c" }],
  };
  const markdown = renderTree(listing, { colour: false, markdown: true });
  expect(markdown).toContain("```text");
  expect(markdown).toContain("└── src/");
  expect(markdown).toContain("    └── index.ts");
});

test("markdown mode emits headings and GFM tables, never escapes", () => {
  const text = renderTrace(payload, { colour: false, markdown: true });
  expect(text).toContain("### Contributors");
  expect(text).toContain("| author | commits | last |");
  expect(text).toContain("| --- | --- | --- |");
  expect(text).toContain("- **Commits** 7");
  expect(text).not.toContain("\x1b[");
});

test("markdown cells escape the table separator", () => {
  const tricky = { ...commit, subject: "fix: a | b" };
  expect(renderCommits([tricky], { colour: false, markdown: true })).toContain("fix: a \\| b");
});

test("text mode stays on aligned columns when markdown is off", () => {
  const text = renderCommits([commit], { colour: false, markdown: false });
  expect(text).not.toContain("| when |");
  expect(text.startsWith("  ")).toBe(true);
});
