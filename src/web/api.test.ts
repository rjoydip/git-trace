import { describe, it, expect, mock, beforeEach } from "bun:test";
import {
  getConfig,
  loadTrace,
  loadFileHistory,
  loadDiffs,
  loadCommits,
  probe,
  loadTree,
  loadRefs,
  loadTag,
  loadFile,
  loadRaw,
  loadTrack,
  loadItems,
  callMcpTool,
  listMcpTools,
  ApiError,
} from "./api";

beforeEach(() => {
  mock("fetch", () => {
    return {
      ok: true,
      status: 200,
      json: async () => ({}),
      blob: async () => new Blob(),
    };
  });

  mock("performance", {
    now: () => 0,
  });

  mock("$lib/telemetry", {
    record: () => {},
  });

  mock("$lib/token", {
    getToken: () => "",
  });

  mock("$lib/prefs", {
    getPrefs: () => ({ cacheTtlSeconds: 3600 }),
  });
});

describe("api", () => {
  it("getConfig", async () => {
    const response = await getConfig();
    expect(response).toEqual({});
  });

  it("loadTrace", async () => {
    const response = await loadTrace("repo");
    expect(response).toEqual({});
  });

  it("loadFileHistory", async () => {
    const response = await loadFileHistory("repo", "path");
    expect(response).toEqual({ path: "path", history: [] });
  });

  it("loadDiffs", async () => {
    const response = await loadDiffs("repo", "path");
    expect(response).toEqual({ path: "path", diffs: [] });
  });

  it("loadCommits", async () => {
    const response = await loadCommits("repo");
    expect(response).toEqual({ commits: [] });
  });

  it("probe", async () => {
    const response = await probe("url");
    expect(response).toEqual({});
  });

  it("loadTree", async () => {
    const response = await loadTree("repo");
    expect(response).toEqual({});
  });

  it("loadRefs", async () => {
    const response = await loadRefs("repo");
    expect(response).toEqual({});
  });

  it("loadTag", async () => {
    const response = await loadTag("repo", "tag");
    expect(response).toEqual({});
  });

  it("loadFile", async () => {
    const response = await loadFile("repo", "path");
    expect(response).toEqual({});
  });

  it("loadRaw", async () => {
    const response = await loadRaw("repo", "path");
    expect(response).toBeInstanceOf(Blob);
  });

  it("loadTrack", async () => {
    const response = await loadTrack("repo", 1, "kind");
    expect(response).toEqual({});
  });

  it("loadItems", async () => {
    const response = await loadItems("repo", "state");
    expect(response).toEqual({ items: [] });
  });

  it("callMcpTool", async () => {
    const response = await callMcpTool("tool", {});
    expect(response).toEqual({
      ok: true,
      status: "200 OK",
      latency: 0,
      tool: "tool",
      args: {},
      payload: {},
      raw: {},
    });
  });

  it("listMcpTools", async () => {
    const response = await listMcpTools();
    expect(response).toEqual({
      ok: true,
      status: "200 OK",
      latency: 0,
      tools: [],
    });
  });

  it("ApiError", () => {
    const error = new ApiError("message", 400);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("ApiError");
    expect(error.status).toBe(400);
  });

  it("getConfig with error", async () => {
    mock("fetch", () => {
      return {
        ok: false,
        status: 400,
        json: async () => ({}),
      };
    });

    await expect(getConfig()).rejects.toThrowError(ApiError);
  });

  it("loadTrace with error", async () => {
    mock("fetch", () => {
      return {
        ok: false,
        status: 400,
        json: async () => ({}),
      };
    });

    await expect(loadTrace("repo")).rejects.toThrowError(ApiError);
  });

  it("loadFileHistory with error", async () => {
    mock("fetch", () => {
      return {
        ok: false,
        status: 400,
        json: async () => ({}),
      };
    });

    await expect(loadFileHistory("repo", "path")).rejects.toThrowError(ApiError);
  });

  it("loadDiffs with error", async () => {
    mock("fetch", () => {
      return {
        ok: false,
        status: 400,
        json: async () => ({}),
      };
    });

    await expect(loadDiffs("repo", "path")).rejects.toThrowError(ApiError);
  });

  it("loadCommits with error", async () => {
    mock("fetch", () => {
      return {
        ok: false,
        status: 400,
        json: async () => ({}),
      };
    });

    await expect(loadCommits("repo")).rejects.toThrowError(ApiError);
  });

  it("probe with error", async () => {
    mock("fetch", () => {
      return {
        ok: false,
        status: 400,
        json: async () => ({}),
      };
    });

    await expect(probe("url")).rejects.toThrowError(ApiError);
  });

  it("loadTree with error", async () => {
    mock("fetch", () => {
      return {
        ok: false,
        status: 400,
        json: async () => ({}),
      };
    });

    await expect(loadTree("repo")).rejects.toThrowError(ApiError);
  });

  it("loadRefs with error", async () => {
    mock("fetch", () => {
      return {
        ok: false,
        status: 400,
        json: async () => ({}),
      };
    });

    await expect(loadRefs("repo")).rejects.toThrowError(ApiError);
  });

  it("loadTag with error", async () => {
    mock("fetch", () => {
      return {
        ok: false,
        status: 400,
        json: async () => ({}),
      };
    });

    await expect(loadTag("repo", "tag")).rejects.toThrowError(ApiError);
  });

  it("loadFile with error", async () => {
    mock("fetch", () => {
      return {
        ok: false,
        status: 400,
        json: async () => ({}),
      };
    });

    await expect(loadFile("repo", "path")).rejects.toThrowError(ApiError);
  });

  it("loadRaw with error", async () => {
    mock("fetch", () => {
      return {
        ok: false,
        status: 400,
        blob: async () => new Blob(),
      };
    });

    await expect(loadRaw("repo", "path")).rejects.toThrowError(ApiError);
  });

  it("loadTrack with error", async () => {
    mock("fetch", () => {
      return {
        ok: false,
        status: 400,
        json: async () => ({}),
      };
    });

    await expect(loadTrack("repo", 1, "kind")).rejects.toThrowError(ApiError);
  });

  it("loadItems with error", async () => {
    mock("fetch", () => {
      return {
        ok: false,
        status: 400,
        json: async () => ({}),
      };
    });

    await expect(loadItems("repo", "state")).rejects.toThrowError(ApiError);
  });

  it("callMcpTool with error", async () => {
    mock("fetch", () => {
      return {
        ok: false,
        status: 400,
        json: async () => ({}),
      };
    });

    await expect(callMcpTool("tool", {})).rejects.toThrowError(ApiError);
  });

  it("listMcpTools with error", async () => {
    mock("fetch", () => {
      return {
        ok: false,
        status: 400,
        json: async () => ({}),
      };
    });

    await expect(listMcpTools()).rejects.toThrowError(ApiError);
  });
});