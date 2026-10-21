import { describe, it, expect, mock, beforeEach } from "bun:test";
import {
  CACHE_TTL_HEADER,
  Prefs,
  CACHE_TTLS,
  WINDOWS,
  getPrefs,
  setPrefs,
  usePrefs,
} from "./prefs";

beforeEach(() => {
  mock(window.localStorage, {
    getItem: () => null,
    setItem: () => undefined,
  });
});

describe("prefs", () => {
  it("exports constants", () => {
    expect(CACHE_TTL_HEADER).toBe("x-cache-ttl");
    expect(CACHE_TTLS).toEqual([
      { id: "0", name: "Off" },
      { id: "60", name: "1 minute" },
      { id: "300", name: "5 minutes" },
      { id: "900", name: "15 minutes" },
      { id: "3600", name: "1 hour" },
    ]);
    expect(WINDOWS).toEqual([
      { id: "7", name: "Last 7 days" },
      { id: "30", name: "Last 30 days" },
      { id: "90", name: "Last 90 days" },
      { id: "0", name: "All time" },
    ]);
  });

  it("reads default prefs", () => {
    expect(getPrefs()).toEqual({ cacheTtlSeconds: 300, windowDays: 0 });
  });

  it("reads prefs from local storage", () => {
    mock(window.localStorage, {
      getItem: () => JSON.stringify({ cacheTtlSeconds: 60, windowDays: 7 }),
    });
    expect(getPrefs()).toEqual({ cacheTtlSeconds: 60, windowDays: 7 });
  });

  it("reads partial prefs from local storage", () => {
    mock(window.localStorage, {
      getItem: () => JSON.stringify({ cacheTtlSeconds: 60 }),
    });
    expect(getPrefs()).toEqual({ cacheTtlSeconds: 60, windowDays: 0 });
  });

  it("reads invalid prefs from local storage", () => {
    mock(window.localStorage, {
      getItem: () => JSON.stringify({ cacheTtlSeconds: "invalid" }),
    });
    expect(getPrefs()).toEqual({ cacheTtlSeconds: 300, windowDays: 0 });
  });

  it("reads prefs with negative values from local storage", () => {
    mock(window.localStorage, {
      getItem: () => JSON.stringify({ cacheTtlSeconds: -1, windowDays: -1 }),
    });
    expect(getPrefs()).toEqual({ cacheTtlSeconds: 300, windowDays: 0 });
  });

  it("sets prefs", () => {
    setPrefs({ cacheTtlSeconds: 60, windowDays: 7 });
    expect(getPrefs()).toEqual({ cacheTtlSeconds: 60, windowDays: 7 });
  });

  it("sets partial prefs", () => {
    setPrefs({ cacheTtlSeconds: 60 });
    expect(getPrefs()).toEqual({ cacheTtlSeconds: 60, windowDays: 0 });
  });

  it("sets invalid prefs", () => {
    setPrefs({ cacheTtlSeconds: "invalid" });
    expect(getPrefs()).toEqual({ cacheTtlSeconds: 300, windowDays: 0 });
  });

  it("sets prefs with negative values", () => {
    setPrefs({ cacheTtlSeconds: -1, windowDays: -1 });
    expect(getPrefs()).toEqual({ cacheTtlSeconds: 300, windowDays: 0 });
  });

  it("throws error when reading prefs from local storage", () => {
    mock(window.localStorage, {
      getItem: () => {
        throw new Error("Mock error");
      },
    });
    expect(getPrefs()).toEqual({ cacheTtlSeconds: 300, windowDays: 0 });
  });

  it("throws error when setting prefs to local storage", () => {
    mock(window.localStorage, {
      setItem: () => {
        throw new Error("Mock error");
      },
    });
    setPrefs({ cacheTtlSeconds: 60, windowDays: 7 });
    expect(getPrefs()).toEqual({ cacheTtlSeconds: 60, windowDays: 7 });
  });

  it("usePrefs returns current prefs", () => {
    expect(usePrefs()).toEqual({ cacheTtlSeconds: 300, windowDays: 0 });
  });

  it("usePrefs updates when prefs change", () => {
    const prefs = usePrefs();
    setPrefs({ cacheTtlSeconds: 60, windowDays: 7 });
    expect(prefs).toEqual({ cacheTtlSeconds: 60, windowDays: 7 });
  });
});