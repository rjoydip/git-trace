import { describe, it, expect, mock, beforeEach } from "bun:test";
import { self } from "./sw";

describe("Service Worker", () => {
  beforeEach(() => {
    mock(self, "caches", {
      open: async () => ({
        put: async () => {},
        match: async () => null,
      }),
    });
    mock(self, "fetch", async () => ({
      ok: true,
      clone: () => ({}),
      arrayBuffer: async () => new ArrayBuffer(0),
    }));
  });

  it("should skip waiting on install", () => {
    const skipWaitingSpy = mock(self, "skipWaiting");
    self.dispatchEvent(new Event("install"));
    expect(skipWaitingSpy).toHaveBeenCalledTimes(1);
  });

  it("should claim clients on activate", async () => {
    const claimClientsSpy = mock(self.clients, "claim");
    self.dispatchEvent(new Event("activate"));
    await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
    expect(claimClientsSpy).toHaveBeenCalledTimes(1);
  });

  it("should not intercept non-GET requests", () => {
    const respondWithSpy = mock(self, "respondWith");
    self.dispatchEvent(
      new FetchEvent("fetch", {
        request: new Request("/", { method: "POST" }),
      }),
    );
    expect(respondWithSpy).not.toHaveBeenCalled();
  });

  it("should not intercept requests from other origins", () => {
    const respondWithSpy = mock(self, "respondWith");
    self.dispatchEvent(
      new FetchEvent("fetch", {
        request: new Request("https://example.com", { method: "GET" }),
      }),
    );
    expect(respondWithSpy).not.toHaveBeenCalled();
  });

  it("should not intercept requests to /api or /mcp", () => {
    const respondWithSpy = mock(self, "respondWith");
    self.dispatchEvent(
      new FetchEvent("fetch", {
        request: new Request("/api/test", { method: "GET" }),
      }),
    );
    expect(respondWithSpy).not.toHaveBeenCalled();
    self.dispatchEvent(
      new FetchEvent("fetch", {
        request: new Request("/mcp/test", { method: "GET" }),
      }),
    );
    expect(respondWithSpy).not.toHaveBeenCalled();
  });

  it("should cache responses", async () => {
    const putSpy = mock(self.caches.open(CACHE).then((cache) => cache), "put");
    const response = {
      ok: true,
      clone: () => ({}),
      arrayBuffer: async () => new ArrayBuffer(0),
    };
    mock(self, "fetch", async () => response);
    self.dispatchEvent(
      new FetchEvent("fetch", {
        request: new Request("/", { method: "GET" }),
      }),
    );
    await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
    expect(putSpy).toHaveBeenCalledTimes(1);
  });

  it("should return cached response on error", async () => {
    const matchSpy = mock(self.caches.open(CACHE).then((cache) => cache), "match");
    const response = {
      ok: true,
      clone: () => ({}),
      arrayBuffer: async () => new ArrayBuffer(0),
    };
    mock(self, "fetch", async () => {
      throw new Error();
    });
    mock(matchSpy, "returns", response);
    const respondWithSpy = mock(self, "respondWith");
    self.dispatchEvent(
      new FetchEvent("fetch", {
        request: new Request("/", { method: "GET" }),
      }),
    );
    await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
    expect(respondWithSpy).toHaveBeenCalledTimes(1);
    expect(respondWithSpy).toHaveBeenCalledWith(Promise.resolve(response));
  });

  it("should return app shell on navigation while offline", async () => {
    const matchSpy = mock(self.caches.open(CACHE).then((cache) => cache), "match");
    const response = {
      ok: true,
      clone: () => ({}),
      arrayBuffer: async () => new ArrayBuffer(0),
    };
    mock(self, "fetch", async () => {
      throw new Error();
    });
    mock(matchSpy, "returns", null);
    const matchShellSpy = mock(self.caches.open(CACHE).then((cache) => cache), "match");
    mock(matchShellSpy, "returns", response);
    const respondWithSpy = mock(self, "respondWith");
    self.dispatchEvent(
      new FetchEvent("fetch", {
        request: new Request("/", { method: "GET", mode: "navigate" }),
      }),
    );
    await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
    expect(respondWithSpy).toHaveBeenCalledTimes(1);
    expect(respondWithSpy).toHaveBeenCalledWith(Promise.resolve(response));
  });

  it("should return error response on cache miss", async () => {
    const matchSpy = mock(self.caches.open(CACHE).then((cache) => cache), "match");
    mock(self, "fetch", async () => {
      throw new Error();
    });
    mock(matchSpy, "returns", null);
    const matchShellSpy = mock(self.caches.open(CACHE).then((cache) => cache), "match");
    mock(matchShellSpy, "returns", null);
    const respondWithSpy = mock(self, "respondWith");
    self.dispatchEvent(
      new FetchEvent("fetch", {
        request: new Request("/", { method: "GET" }),
      }),
    );
    await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
    expect(respondWithSpy).toHaveBeenCalledTimes(1);
    expect(respondWithSpy).toHaveBeenCalledWith(Promise.resolve(new Response(null, { status: 0, statusText: "" })));
  });
});