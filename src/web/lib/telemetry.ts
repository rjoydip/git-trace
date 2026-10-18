/**
 * Client-side record of everything the dashboard asked the server to do.
 *
 * The Telemetry tab renders this. It is deliberately a plain module-level store
 * rather than React state: the `api` module records into it from outside the
 * component tree, and `useSyncExternalStore` keeps the UI in step.
 */
export interface TelemetryEvent {
  id: string;
  /** Wall-clock time the call finished, `HH:MM:SS.mmm`. */
  time: string;
  /** JSON-RPC method (`tools/call`) or HTTP verb (`GET`). */
  method: string;
  /** MCP tool name, or the API path. */
  target: string;
  kind: "mcp" | "api";
  /** e.g. `200 OK`, `403 RATE_LIMIT`, `ERR`. */
  status: string;
  ok: boolean;
  latency: number;
  params: unknown;
  result: unknown;
}

const MAX_EVENTS = 60;

let snapshot: TelemetryEvent[] = [];
const listeners = new Set<() => void>();
let seq = 0;

export function record(event: Omit<TelemetryEvent, "id" | "time">): void {
  const now = new Date();
  const pad = (n: number, width = 2) => String(n).padStart(width, "0");
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}.${pad(now.getMilliseconds(), 3)}`;
  snapshot = [{ ...event, id: `evt-${++seq}`, time }, ...snapshot].slice(0, MAX_EVENTS);
  for (const listener of listeners) listener();
}

export function clearTelemetry(): void {
  snapshot = [];
  for (const listener of listeners) listener();
}

export function subscribeTelemetry(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const telemetrySnapshot = (): TelemetryEvent[] => snapshot;
