import { describe, expect, test } from "bun:test";
import { authorTallies, commitAuthor, commitBody, filterCommits } from "./commits";
import type { Commit } from "../../core/types";

function commit(sha: string, author: { name: string; login?: string }, subject: string): Commit {
  return {
    sha,
    shortSha: sha.slice(0, 7),
    message: `${subject}\n\nbody of ${subject}`,
    subject,
    author: { email: `${author.name}@example.com`, ...author },
    url: "",
    parents: [],
    date: "2026-01-01T10:00:00Z",
  };
}

const commits: Commit[] = [
  commit("aaaaaaaa1", { name: "Ada", login: "ada" }, "fix parser"),
  commit("bbbbbbbb2", { name: "Ada", login: "ada" }, "add lexer"),
  commit("cccccccc3", { name: "Grace", login: "grace" }, "docs pass"),
];

describe("commitAuthor", () => {
  test("prefers the GitHub login and falls back to the name", () => {
    expect(commitAuthor(commits[0]!)).toBe("ada");
    expect(commitAuthor(commit("d", { name: "Linus" }, "x"))).toBe("Linus");
  });
});

describe("authorTallies", () => {
  test("ranks authors by commit count, then name", () => {
    expect(authorTallies(commits)).toEqual([
      { name: "ada", count: 2 },
      { name: "grace", count: 1 },
    ]);
  });
});

describe("commitBody", () => {
  test("is everything past the subject line", () => {
    expect(commitBody(commits[0]!)).toBe("body of fix parser");
  });

  test("is empty when the message is only the subject", () => {
    expect(commitBody({ ...commits[0]!, message: "fix parser" })).toBe("");
  });
});

describe("filterCommits", () => {
  const base = { author: "all", query: "", order: "newest" } as const;

  test("an empty filter is a pass-through", () => {
    expect(filterCommits(commits, base).map((c) => c.shortSha)).toEqual([
      "aaaaaaa",
      "bbbbbbb",
      "ccccccc",
    ]);
  });

  test("filters by author", () => {
    expect(filterCommits(commits, { ...base, author: "grace" }).map((c) => c.subject)).toEqual([
      "docs pass",
    ]);
  });

  test("searches subject, body, SHA and author, case-insensitively", () => {
    const subjects = (query: string) =>
      filterCommits(commits, { ...base, query }).map((c) => c.subject);
    expect(subjects("PARSER")).toEqual(["fix parser"]);
    expect(subjects("body of docs")).toEqual(["docs pass"]);
    expect(subjects("ccccccc")).toEqual(["docs pass"]);
    expect(subjects("grace")).toEqual(["docs pass"]);
    expect(subjects("nothing")).toEqual([]);
  });

  test("oldest first reverses without mutating the input", () => {
    const oldest = filterCommits(commits, { ...base, order: "oldest" });
    expect(oldest.map((c) => c.subject)).toEqual(["docs pass", "add lexer", "fix parser"]);
    expect(commits.map((c) => c.subject)).toEqual(["fix parser", "add lexer", "docs pass"]);
  });

  test("author and text compose", () => {
    expect(
      filterCommits(commits, { ...base, author: "ada", query: "lexer" }).map((c) => c.subject),
    ).toEqual(["add lexer"]);
  });

  test("hasBody drops subject-only commits", () => {
    const bare = commit("dddddddd4", { name: "Ada", login: "ada" }, "no body here");
    bare.message = "no body here";
    const pool = [...commits, bare];
    expect(filterCommits(pool, { ...base, hasBody: true }).map((c) => c.shortSha)).toEqual([
      "aaaaaaa",
      "bbbbbbb",
      "ccccccc",
    ]);
    expect(filterCommits(pool, base)).toHaveLength(4);
  });
});
