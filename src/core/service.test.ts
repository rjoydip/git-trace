import { describe, it, expect, mock, beforeEach } from "bun:test";
import { TraceService, TraceServiceOptions } from "./service";

describe("TraceService", () => {
  let service: TraceService;

  beforeEach(() => {
    service = new TraceService();
  });

  it("resolveRepo", () => {
    expect(service.resolveRepo("owner/repo")).toEqual({ owner: "owner", name: "repo" });
    expect(service.resolveRepo("https://github.com/owner/repo")).toEqual({ owner: "owner", name: "repo" });
  });

  it("repo", async () => {
    const repo = { name: "repo", owner: "owner" };
    mock(service.client, "getRepo").resolveWith(repo);
    expect(await service.repo("owner/repo")).toEqual(repo);
  });

  it("trace", async () => {
    const ref = { owner: "owner", name: "repo" };
    const meta = { name: "repo", owner: "owner" };
    const commits = [{ sha: "sha1" }, { sha: "sha2" }];
    const contributors = [{ login: "contributor1" }, { login: "contributor2" }];
    const details = [{ files: [{ filename: "file1" }], stats: { additions: 1, deletions: 0 } }, { files: [{ filename: "file2" }], stats: { additions: 0, deletions: 1 } }];
    mock(service.client, "getRepo").resolveWith(meta);
    mock(service.client, "listCommits").resolveWith(commits);
    mock(service.client, "getContributors").resolveWith(contributors);
    mock(service.client, "cached").resolveWith(details);
    const result = await service.trace("owner/repo");
    expect(result.repo).toBe("owner/repo");
    expect(result.meta).toBe(meta);
    expect(result.stats).toEqual({ filesTouched: 2, additions: 1, deletions: 1 });
    expect(result.commits).toEqual(commits.slice(0, 50));
    expect(result.contributors).toEqual([{ login: "contributor1" }, { login: "contributor2" }]);
    expect(result.hotFiles).toBeDefined();
    expect(result.activity).toBeDefined();
    expect(result.fileGraph).toBeDefined();
  });

  it("stats", async () => {
    const commits = [{ sha: "sha1" }, { sha: "sha2" }];
    const details = [{ files: [{ filename: "file1" }], stats: { additions: 1, deletions: 0 } }, { files: [{ filename: "file2" }], stats: { additions: 0, deletions: 1 } }];
    mock(service.client, "listCommits").resolveWith(commits);
    mock(service.client, "cached").resolveWith(details);
    const result = await service.stats("owner/repo");
    expect(result).toEqual({ filesTouched: 2, additions: 1, deletions: 1 });
  });

  it("commits", async () => {
    const commits = [{ sha: "sha1" }, { sha: "sha2" }];
    mock(service.client, "listCommits").resolveWith(commits);
    expect(await service.commits("owner/repo")).toEqual(commits);
  });

  it("contributors", async () => {
    const commits = [{ sha: "sha1" }, { sha: "sha2" }];
    const contributors = [{ login: "contributor1" }, { login: "contributor2" }];
    mock(service.client, "listCommits").resolveWith(commits);
    mock(service.client, "getContributors").resolveWith(contributors);
    expect(await service.contributors("owner/repo")).toEqual([{ login: "contributor1" }, { login: "contributor2" }]);
  });

  it("activity", async () => {
    const commits = [{ sha: "sha1" }, { sha: "sha2" }];
    mock(service.client, "listCommits").resolveWith(commits);
    expect(await service.activity("owner/repo")).toBeDefined();
  });

  it("hotFiles", async () => {
    const details = [{ files: [{ filename: "file1" }], stats: { additions: 1, deletions: 0 } }, { files: [{ filename: "file2" }], stats: { additions: 0, deletions: 1 } }];
    mock(service.client, "cached").resolveWith(details);
    expect(await service.hotFiles("owner/repo")).toBeDefined();
  });

  it("fileHistory", async () => {
    const details = [{ files: [{ filename: "file1" }], stats: { additions: 1, deletions: 0 } }, { files: [{ filename: "file2" }], stats: { additions: 0, deletions: 1 } }];
    mock(service.client, "cached").resolveWith(details);
    expect(await service.fileHistory("owner/repo", "file1")).toBeDefined();
  });

  it("fileDiffs", async () => {
    const details = [{ files: [{ filename: "file1" }], stats: { additions: 1, deletions: 0 } }, { files: [{ filename: "file2" }], stats: { additions: 0, deletions: 1 } }];
    mock(service.client, "cached").resolveWith(details);
    expect(await service.fileDiffs("owner/repo", "file1")).toBeDefined();
  });

  it("track", async () => {
    const item = { number: 1, title: "title" };
    const commits = [{ sha: "sha1" }, { sha: "sha2" }];
    const reviews = [{ id: 1, state: "approved" }, { id: 2, state: "rejected" }];
    const comments = [{ id: 1, body: "comment1" }, { id: 2, body: "comment2" }];
    mock(service.client, "getIssue").resolveWith(item);
    mock(service.client, "getItemComments").resolveWith(comments);
    expect(await service.track("owner/repo", { number: 1, kind: "issue" })).toEqual({ ...item, activity: [] });
    mock(service.client, "getPull").resolveWith(item);
    mock(service.client, "getPullCommits").resolveWith(commits);
    mock(service.client, "getPullReviews").resolveWith(reviews);
    expect(await service.track("owner/repo", { number: 1, kind: "pull" })).toEqual({ ...item, activity: [] });
  });

  it("items", async () => {
    const items = [{ number: 1, title: "title" }, { number: 2, title: "title2" }];
    mock(service.client, "listItems").resolveWith(items);
    expect(await service.items("owner/repo")).toEqual(items);
  });

  it("tree", async () => {
    const tree = { entries: [{ path: "path1" }, { path: "path2" }], truncated: false };
    mock(service.client, "getTree").resolveWith(tree);
    expect(await service.tree("owner/repo")).toEqual(tree);
  });

  it("refs", async () => {
    const refs = { branches: ["branch1", "branch2"], tags: ["tag1", "tag2"] };
    mock(service.client, "getRefs").resolveWith(refs);
    expect(await service.refs("owner/repo")).toEqual(refs);
  });

  it("tag", async () => {
    const tag = { name: "tag1", commit: { sha: "sha1" } };
    mock(service.client, "getTag").resolveWith(tag);
    expect(await service.tag("owner/repo", "tag1")).toEqual(tag);
  });

  it("file", async () => {
    const file = { content: "content" };
    mock(service.client, "getFile").resolveWith(file);
    expect(await service.file("owner/repo", "path1")).toEqual(file);
  });

  it("raw", async () => {
    const response = new Response("content");
    mock(service.client, "getRaw").resolveWith(response);
    expect(await service.raw("owner/repo", "path1")).toEqual(response);
  });

  it("detailsFor", async () => {
    const commits = [{ sha: "sha1" }, { sha: "sha2" }];
    const details = [{ files: [{ filename: "file1" }], stats: { additions: 1, deletions: 0 } }, { files: [{ filename: "file2" }], stats: { additions: 0, deletions: 1 } }];
    mock(service.client, "cached").resolveWith(details);
    expect(await service.detailsFor({ owner: "owner", name: "repo" }, commits)).toEqual(details);
  });

  it("details", async () => {
    const commits = [{ sha: "sha1" }, { sha: "sha2" }];
    const details = [{ files: [{ filename: "file1" }], stats: { additions: 1, deletions: 0 } }, { files: [{ filename: "file2" }], stats: { additions: 0, deletions: 1 } }];
    mock(service.client, "listCommits").resolveWith(commits);
    mock(service.client, "cached").resolveWith(details);
    expect(await service.details("owner/repo", 10)).toEqual(details);
  });

  it("clamp", () => {
    expect(clamp(10, 1, 100)).toBe(10);
    expect(clamp(101, 1, 100)).toBe(100);
    expect(clamp(0, 1, 100)).toBe(1);
  });
});