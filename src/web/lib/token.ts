/**
 * Bring-your-own GitHub token.
 *
 * Held in this browser and sent as `x-github-token` on same-origin requests, so
 * the Worker can use it for that one call and never persist it. Nothing here is
 * ever written to a response or a log.
 *
 * Local storage is readable by any script on this origin — the usual trade for a
 * token you paste yourself. A shared machine should use Clear after use.
 */
import { useSyncExternalStore } from "react";

const KEY = "git-trace:token";

/** Header the Worker reads. Keep in sync with `src/worker/index.ts`. */
export const TOKEN_HEADER = "x-github-token";

function read(): string {
  try {
    return window.localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

function persist(value: string): void {
  try {
    if (value) window.localStorage.setItem(KEY, value);
    else window.localStorage.removeItem(KEY);
  } catch {
    // Private mode: the token still applies for this session.
  }
}

let state = read();
const listeners = new Set<() => void>();

export const getToken = (): string => state;

export function setToken(next: string): void {
  state = next.trim();
  persist(state);
  for (const listener of listeners) listener();
}

export function subscribeToken(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const tokenSnapshot = (): string => state;

export function useToken(): string {
  return useSyncExternalStore(subscribeToken, tokenSnapshot, tokenSnapshot);
}
