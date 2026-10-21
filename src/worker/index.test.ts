import { describe, it, expect, mock, beforeEach } from "bun:test";
import app from "./index";

beforeEach(() => {
  // Mock network, timers and randomness
  mock("timers", {
    setTimeout: () => {},
    clearTimeout: () => {},
    setInterval: () => {},
    clearInterval: () => {},
  });
  mock("crypto", {
    randomBytes: () => new Uint8Array(16),
  });
  mock("fetch", () => new Response("Mocked response"));
});

describe("app", () => {
  it("should return 200 for /api/health", async () => {
    const response = await app.fetch("/api/health");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok", timestamp: expect.any(String) });
  });

  it("should return 200 for /api/config", async () => {
    const response = await app.fetch("/api/config");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ cacheTtlSeconds: 300 });
  });

  it("should return 400 for /api/trace with no repo", async () => {
    const response = await app.fetch("/api/trace");
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "No repository: pass ?repo=owner/name", status: 400 });
  });

  it("should return 200 for /api/trace with repo", async () => {
    const response = await app.fetch("/api/trace?repo=owner/name");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(expect.any(Object));
  });

  it("should return 400 for /api/repo with no repo", async () => {
    const response = await app.fetch("/api/repo");
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "No repository: pass ?repo=owner/name", status: 400 });
  });

  it("should return 200 for /api/repo with repo", async () => {
    const response = await app.fetch("/api/repo?repo=owner/name");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(expect.any(Object));
  });

  it("should return 400 for /api/stats with no repo", async () => {
    const response = await app.fetch("/api/stats");
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "No repository: pass ?repo=owner/name", status: 400 });
  });

  it("should return 200 for /api/stats with repo", async () => {
    const response = await app.fetch("/api/stats?repo=owner/name");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(expect.any(Object));
  });

  it("should return 400 for /api/commits with no repo", async () => {
    const response = await app.fetch("/api/commits");
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "No repository: pass ?repo=owner/name", status: 400 });
  });

  it("should return 200 for /api/commits with repo", async () => {
    const response = await app.fetch("/api/commits?repo=owner/name");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ commits: expect.any(Array) });
  });

  it("should return 400 for /api/contributors with no repo", async () => {
    const response = await app.fetch("/api/contributors");
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "No repository: pass ?repo=owner/name", status: 400 });
  });

  it("should return 200 for /api/contributors with repo", async () => {
    const response = await app.fetch("/api/contributors?repo=owner/name");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ contributors: expect.any(Array) });
  });

  it("should return 400 for /api/hot-files with no repo", async () => {
    const response = await app.fetch("/api/hot-files");
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "No repository: pass ?repo=owner/name", status: 400 });
  });

  it("should return 200 for /api/hot-files with repo", async () => {
    const response = await app.fetch("/api/hot-files?repo=owner/name");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ files: expect.any(Array) });
  });

  it("should return 400 for /api/file-history with no repo", async () => {
    const response = await app.fetch("/api/file-history");
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "No repository: pass ?repo=owner/name", status: 400 });
  });

  it("should return 400 for /api/file-history with no path", async () => {
    const response = await app.fetch("/api/file-history?repo=owner/name");
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "path is required", status: 400 });
  });

  it("should return 200 for /api/file-history with repo and path", async () => {
    const response = await app.fetch("/api/file-history?repo=owner/name&path=file.txt");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ path: "file.txt", history: expect.any(Array) });
  });

  it("should return 400 for /api/diff with no repo", async () => {
    const response = await app.fetch("/api/diff");
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "No repository: pass ?repo=owner/name", status: 400 });
  });

  it("should return 400 for /api/diff with no path", async () => {
    const response = await app.fetch("/api/diff?repo=owner/name");
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "path is required", status: 400 });
  });

  it("should return 200 for /api/diff with repo and path", async () => {
    const response = await app.fetch("/api/diff?repo=owner/name&path=file.txt");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ path: "file.txt", diffs: expect.any(Array) });
  });

  it("should return 400 for /api/tree with no repo", async () => {
    const response = await app.fetch("/api/tree");
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "No repository: pass ?repo=owner/name", status: 400 });
  });

  it("should return 200 for /api/tree with repo", async () => {
    const response = await app.fetch("/api/tree?repo=owner/name");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(expect.any(Object));
  });

  it("should return 400 for /api/refs with no repo", async () => {
    const response = await app.fetch("/api/refs");
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "No repository: pass ?repo=owner/name", status: 400 });
  });

  it("should return 200 for /api/refs with repo", async () => {
    const response = await app.fetch("/api/refs?repo=owner/name");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(expect.any(Object));
  });

  it("should return 400 for /api/tag with no repo", async () => {
    const response = await app.fetch("/api/tag");
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "No repository: pass ?repo=owner/name", status: 400 });
  });

  it("should return 400 for /api/tag with no tag", async () => {
    const response = await app.fetch("/api/tag?repo=owner/name");
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "tag is required", status: 400 });
  });

  it("should return 200 for /api/tag with repo and tag", async () => {
    const response = await app.fetch("/api/tag?repo=owner/name&tag=v1.0.0");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(expect.any(Object));
  });

  it("should return 400 for /api/file with no repo", async () => {
    const response = await app.fetch("/api/file");
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "No repository: pass ?repo=owner/name", status: 400 });
  });

  it("should return 400 for /api/file with no path", async () => {
    const response = await app.fetch("/api/file?repo=owner/name");
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "path is required", status: 400 });
  });

  it("should return 200 for /api/file with repo and path", async () => {
    const response = await app.fetch("/api/file?repo=owner/name&path=file.txt");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(expect.any(Object));
  });

  it("should return 400 for /api/raw with no repo", async () => {
    const response = await app.fetch("/api/raw");
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "No repository: pass ?repo=owner/name", status: 400 });
  });

  it("should return 400 for /api/raw with no path", async () => {
    const response = await app.fetch("/api/raw?repo=owner/name");
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "path is required", status: 400 });
  });

  it("should return 200 for /api/raw with repo and path", async () => {
    const response = await app.fetch("/api/raw?repo=owner/name&path=file.txt");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/plain");
  });

  it("should return 400 for /api/track with no repo", async () => {
    const response = await app.fetch("/api/track");
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "No repository: pass ?repo=owner/name", status: 400 });
  });

  it("should return 400 for /api/track with no number", async () => {
    const response = await app.fetch("/api/track?repo=owner/name");
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "number is required", status: 400 });
  });

  it("should return 400 for /api/track with invalid number", async () => {
    const response = await app.fetch("/api/track?repo=owner/name&number=abc");
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Not a pull request or issue number: \"abc\"", status: 400 });
  });

  it("should return 200 for /api/track with repo and number", async () => {
    const response = await app.fetch("/api/track?repo=owner/name&number=123");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(expect.any(Object));
  });

  it("should return 400 for /api/activity with no repo", async () => {
    const response = await app.fetch("/api/activity");
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "No repository: pass ?repo=owner/name", status: 400 });
  });

  it("should return 200 for /api/activity with repo", async () => {
    const response = await app.fetch("/api/activity?repo=owner/name");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ activity: expect.any(Array) });
  });

  it("should return 400 for /api/items with no repo", async () => {
    const response = await app.fetch("/api/items");
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "No repository: pass ?repo=owner/name", status: 400 });
  });

  it("should return 200 for /api/items with repo", async () => {
    const response = await app.fetch("/api/items?repo=owner/name");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ items: expect.any(Array) });
  });

  it("should return 404 for unknown API paths", async () => {
    const response = await app.fetch("/api/unknown");
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Not found" });
  });

  it("should return static assets for non-API paths", async () => {
    const response = await app.fetch("/");
    expect(response.status).toBe(200);
  });
});