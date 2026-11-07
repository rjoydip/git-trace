import { expect, test } from "bun:test";
import { buildContextPrompt } from "../src/core/prompt";
import type { AuthorRollup } from "../src/core/trace";
import type { Commit, HotFile, RepoSummary, TraceStats } from "../src/core/types";

const meta: RepoSummary = {
  fullName: "octocat/trace-demo",
  description: "Seeded history",
  stars: 3,
  forks: 1,
  openIssues: 0,
  defaultBranch: "main",
  language: "TypeScript",
  url: "https://example.test",
};

const stats: TraceStats = {
  commits: 7,
  authors: 3,
  filesTouched: 3,
  additions: 14,
  deletions: 2,
  firstCommit: "2026-10-13T00:00:00.000Z",
  lastCommit: "2026-11-02T00:00:00.000Z",
};

const commit: Commit = {
  sha: "6650f6c172385bd2e397e87c88d8f2cad453d700",
  shortSha: "6650f6c",
  message: "feat: add half",
  subject: "feat: add half",
  author: { name: "hubot", email: "hubot@localhost", login: "hubot" },
  date: "2026-10-29T18:28:00.000Z",
  url: "https://example.test/commit",
  parents: [],
};

const contributor = (index: number): AuthorRollup => ({
  name: `user${index}`,
  email: `user${index}@localhost`,
  login: `user${index}`,
  commits: index,
  lastCommit: commit.date,
});

const hotFile = (index: number): HotFile => ({
  path: `src/file${index}.ts`,
  commits: index,
  additions: index,
  deletions: 0,
  churn: index,
});

test("the digest names the repository and its headline numbers", () => {
  const text = buildContextPrompt({
    meta,
    stats,
    contributors: [contributor(2)],
    hotFiles: [hotFile(3)],
    commits: [commit],
  });

  expect(text).toContain("[REPOSITORY CONTEXT — octocat/trace-demo]");
  expect(text).toContain("Branch: main · Language: TypeScript · Stars: 3");
  expect(text).toContain("STATS: 7 commits · 3 contributors · 3 files touched");
  expect(text).toContain("+14 / -2 lines");
  expect(text).toContain("6650f6c");
});

test("the digest caps each list at its documented size", () => {
  const text = buildContextPrompt({
    meta,
    stats,
    contributors: Array.from({ length: 15 }, (_, index) => contributor(index)),
    hotFiles: Array.from({ length: 15 }, (_, index) => hotFile(index)),
    commits: Array.from({ length: 30 }, () => commit),
  });

  expect(text).toContain("user9 —");
  expect(text).not.toContain("user10 —");
  expect(text).toContain("src/file9.ts");
  expect(text).not.toContain("src/file10.ts");
  expect(text.split("feat: add half").length - 1).toBe(20);
});

test("--full raises every cap", () => {
  const text = buildContextPrompt(
    {
      meta,
      stats,
      contributors: Array.from({ length: 15 }, (_, index) => contributor(index)),
      hotFiles: Array.from({ length: 15 }, (_, index) => hotFile(index)),
      commits: Array.from({ length: 30 }, () => commit),
    },
    { contributors: Infinity, hotFiles: Infinity, commits: Infinity },
  );

  expect(text).toContain("user14 —");
  expect(text).toContain("src/file14.ts");
  expect(text.split("feat: add half").length - 1).toBe(30);
});
