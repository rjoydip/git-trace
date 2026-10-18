/**
 * Dashboard preferences that the Worker needs to know about. They live in this
 * browser and travel as request headers, so a deployment holds no per-user
 * configuration.
 */
import { useSyncExternalStore } from "react";

/** Header the Worker reads for the edge-cache TTL. Mirrors `src/worker/index.ts`. */
export const CACHE_TTL_HEADER = "x-cache-ttl";

export interface Prefs {
  /** Edge-cache TTL in seconds. 0 disables caching. */
  cacheTtlSeconds: number;
  /** Commit-graph window in days. 0 means everything that was fetched. */
  windowDays: number;
}

const KEY = "git-trace:prefs";

export const CACHE_TTLS: ReadonlyArray<{ id: string; name: string }> = [
  { id: "0", name: "Off" },
  { id: "60", name: "1 minute" },
  { id: "300", name: "5 minutes" },
  { id: "900", name: "15 minutes" },
  { id: "3600", name: "1 hour" },
];

export const WINDOWS: ReadonlyArray<{ id: string; name: string }> = [
  { id: "7", name: "Last 7 days" },
  { id: "30", name: "Last 30 days" },
  { id: "90", name: "Last 90 days" },
  { id: "0", name: "All time" },
];

/** Everything fetched, matching a deployment with no preference set. */
const DEFAULTS: Prefs = { cacheTtlSeconds: 300, windowDays: 0 };

function pick(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function read(): Prefs {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    return {
      cacheTtlSeconds: pick(parsed.cacheTtlSeconds, DEFAULTS.cacheTtlSeconds),
      windowDays: pick(parsed.windowDays, DEFAULTS.windowDays),
    };
  } catch {
    return DEFAULTS;
  }
}

let state = read();
const listeners = new Set<() => void>();

export const getPrefs = (): Prefs => state;

export function setPrefs(next: Partial<Prefs>): void {
  state = { ...state, ...next };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Private mode: the preference still applies for this session.
  }
  for (const listener of listeners) listener();
}

export function subscribePrefs(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const prefsSnapshot = (): Prefs => state;

export function usePrefs(): Prefs {
  return useSyncExternalStore(subscribePrefs, prefsSnapshot, prefsSnapshot);
}
