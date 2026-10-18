import { describe, expect, test } from "bun:test";
import {
  activityTimeline,
  fileDiffs,
  fileGraph,
  fileHistory,
  hotFiles,
  itemActivity,
  rollupAuthors,
  searchCommits,
  summarize,
} from "./trace";
import type { Commit, CommitDetail } from "./types";

function commit(partial: Partial<Commit> & { sha: string; date: string }): Commit {
  return {
    shortSha: partial.sha.slice(0, 7),
    message: "subject\n\nbody",
    subject: "subject",
    author: { name: "Ada", email: "ada@example.com", login: "ada" },
    url: "",
    parents: [],
    ...partial,
  };
}

const commits: Commit[] = [
  commit({ sha: "aaaaaaa1", date: "2026-01-01T10:00:00Z", subject: "fix parser" }),
  commit({
    sha: "aaaaaaa2",
    date: "2026-01-01T12:00:00Z",
    author: { name: "Grace", email: "grace@example.com", login: "grace" },
    subject: "add lexer",
  }),
  commit({ sha: "aaaaaaa3", date: "2026-01-03T09:00:00Z", subject: "docs" }),
];

describe("summarize", () => {
  test("counts commits, authors and date span", () => {
    const stats = summarize(commits);
    expect(stats.commits).toBe(3);
    expect(stats.authors).toBe(2);
    expect(stats.firstCommit).toBe("2026-01-01T10:00:00Z");
    expect(stats.lastCommit).toBe("2026-01-03T09:00:00Z");
  });
});

describe("rollupAuthors", () => {
  test("groups by email and sorts by commit count", () => {
    const authors = rollupAuthors(commits);
    expect(authors.length).toBe(2);
    expect(authors[0]?.commits).toBe(2);
    expect(authors[0]?.name).toBe("Ada");
  });
});

describe("activityTimeline", () => {
  test("zero-fills the range between first and last commit", () => {
    const buckets = activityTimeline(commits);
    expect(buckets.map((b) => b.date)).toEqual(["2026-01-01", "2026-01-02", "2026-01-03"]);
    expect(buckets.map((b) => b.count)).toEqual([2, 0, 1]);
  });
});

describe("searchCommits", () => {
  test("matches subject, author and sha prefix", () => {
    expect(searchCommits(commits, "lexer").length).toBe(1);
    expect(searchCommits(commits, "grace").length).toBe(1);
    expect(searchCommits(commits, "aaaaaaa3").length).toBe(1);
    expect(searchCommits(commits, "").length).toBe(3);
  });
});

describe("hotFiles / fileHistory", () => {
  const details: CommitDetail[] = [
    {
      ...commits[0]!,
      files: [{ filename: "src/a.ts", status: "modified", additions: 10, deletions: 2 }],
      stats: { additions: 10, deletions: 2, total: 12 },
    },
    {
      ...commits[1]!,
      files: [
        { filename: "src/a.ts", status: "modified", additions: 5, deletions: 5 },
        { filename: "src/b.ts", status: "added", additions: 30, deletions: 0 },
      ],
      stats: { additions: 35, deletions: 5, total: 40 },
    },
  ];

  test("ranks files by churn", () => {
    const hot = hotFiles(details);
    expect(hot[0]?.path).toBe("src/b.ts");
    expect(hot[0]?.churn).toBe(30);
    expect(hot.find((f) => f.path === "src/a.ts")?.commits).toBe(2);
  });

  test("returns a file's touches newest first", () => {
    const history = fileHistory(details, "src/a.ts");
    expect(history.length).toBe(2);
    expect(history[0]?.sha).toBe("aaaaaaa2");
  });

  test("carries only the patches GitHub supplied, newest first", () => {
    const withPatch: CommitDetail[] = [
      { ...details[0]!, files: [{ ...details[0]!.files[0]!, patch: "@@\n-old\n+new" }] },
      { ...details[1]!, files: details[1]!.files.map((f) => ({ ...f })) },
    ];
    const diffs = fileDiffs(withPatch, "src/a.ts");
    expect(diffs.length).toBe(1);
    expect(diffs[0]?.patch).toBe("@@\n-old\n+new");
    expect(fileDiffs(withPatch, "src/missing.ts")).toEqual([]);
  });
});

describe("fileGraph", () => {
  const details: CommitDetail[] = [
    {
      ...commits[0]!,
      files: [{ filename: "src/a.ts", status: "modified", additions: 10, deletions: 2 }],
      stats: { additions: 10, deletions: 2, total: 12 },
    },
    {
      ...commits[1]!,
      files: [
        { filename: "src/a.ts", status: "modified", additions: 5, deletions: 5 },
        { filename: "src/b.ts", status: "added", additions: 30, deletions: 0 },
        { filename: "README.md", status: "modified", additions: 1, deletions: 0 },
      ],
      stats: { additions: 36, deletions: 5, total: 41 },
    },
  ];

  test("sizes nodes by churn and groups them by top-level directory", () => {
    const { nodes } = fileGraph(details);
    expect(nodes.map((n) => n.path)).toEqual(["src/b.ts", "src/a.ts", "README.md"]);
    expect(nodes.find((n) => n.path === "src/a.ts")?.commits).toBe(2);
    expect(nodes.find((n) => n.path === "README.md")?.group).toBe("(root)");
  });

  test("links files a commit touched together, counting repeats", () => {
    const { links } = fileGraph(details);
    const key = (l: { source: string; target: string }) => `${l.source}+${l.target}`;
    expect(links.map(key)).toEqual([
      "README.md+src/a.ts",
      "README.md+src/b.ts",
      "src/a.ts+src/b.ts",
    ]);
    expect(links.every((l) => l.weight === 1)).toBe(true);
  });

  test("honours the node and link caps, dropping orphaned links", () => {
    const { nodes, links } = fileGraph(details, { nodes: 2, links: 1 });
    expect(nodes.map((n) => n.path)).toEqual(["src/b.ts", "src/a.ts"]);
    expect(links).toEqual([{ source: "src/a.ts", target: "src/b.ts", weight: 1 }]);
  });
});

describe("itemActivity", () => {
  test("merges commits, reviews and comments newest first", () => {
    const actor = { login: "ann", avatar: null };
    const activity = itemActivity(
      [commit({ sha: "aaaaaaa1", date: "2024-01-01T00:00:00Z" })],
      [
        {
          id: "9",
          author: actor,
          state: "APPROVED",
          submittedAt: "2024-01-03T00:00:00Z",
          url: "u",
        },
      ],
      [
        {
          id: "5",
          author: actor,
          body: "first line\nsecond",
          createdAt: "2024-01-02T00:00:00Z",
          url: "u",
        },
      ],
    );

    expect(activity.map((e) => e.kind)).toEqual(["review", "comment", "commit"]);
    expect(activity[0]?.text).toBe("approved");
    expect(activity[1]?.text).toBe("first line");
  });

  test("drops undated entries instead of sorting them as epoch", () => {
    const actor = { login: "ann", avatar: null };
    const activity = itemActivity(
      [],
      [{ id: "1", author: actor, state: "COMMENTED", submittedAt: null, url: "u" }],
      [{ id: "2", author: actor, body: "hi", createdAt: "2024-01-02T00:00:00Z", url: "u" }],
    );

    expect(activity.length).toBe(1);
    expect(activity[0]?.kind).toBe("comment");
  });
});
