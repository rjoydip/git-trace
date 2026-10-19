import { record } from "@/lib/telemetry";
import { getToken, TOKEN_HEADER } from "@/lib/token";
import { CACHE_TTL_HEADER, getPrefs } from "@/lib/prefs";
import type { FileTouch } from "../core/trace";
import type { TracePayload } from "../core/service";
import type {
  Commit,
  FileContent,
  FileDiff,
  ItemKind,
  ItemState,
  ItemSummary,
  RepoRefs,
  RepoTree,
  TagDetail,
  TrackedItem,
} from "../core/types";

export type { TracePayload };

/** How this deployment is configured — surfaced in the dashboard's settings. */
export interface DeploymentConfig {
  /** Edge-cache TTL for a caller that sends no preference of its own. */
  cacheTtlSeconds: number;
}

/** An API failure that keeps the HTTP status, so callers can tell 409 from 403. */
export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

const STATUS_TEXT: Record<number, string> = {
  400: "BAD_REQUEST",
  401: "UNAUTHORIZED",
  403: "RATE_LIMIT",
  404: "NOT_FOUND",
  409: "CONFLICT",
  422: "UNPROCESSABLE",
  429: "RATE_LIMIT",
  500: "SERVER_ERR",
};

function statusLabel(status: number, ok: boolean): string {
  return `${status} ${STATUS_TEXT[status] ?? (ok ? "OK" : "ERR")}`;
}

/**
 * Telemetry keeps a bounded history in memory, so multi-megabyte payloads are
 * replaced by a shape summary — enough to inspect, too small to hoard.
 */
const FULL_PAYLOAD_LIMIT = 4096;

function summarize(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return value;
  let text: string;
  try {
    text = JSON.stringify(value) ?? "";
  } catch {
    return String(value);
  }
  if (text.length <= FULL_PAYLOAD_LIMIT) return value;
  if (Array.isArray(value)) return { count: value.length, sample: value[0] };
  return {
    keys: Object.keys(value),
    sizes: Object.entries(value)
      .filter(([, v]) => Array.isArray(v))
      .map(([k, v]) => `${k}[${(v as unknown[]).length}]`),
  };
}

/* --------------------------------------------------------------------- JSON */

export function getConfig(): Promise<DeploymentConfig> {
  return getJson<DeploymentConfig>("/api/config");
}

export function loadTrace(repo: string): Promise<TracePayload> {
  return getJson<TracePayload>(`/api/trace?repo=${encodeURIComponent(repo)}`);
}

export function loadFileHistory(
  repo: string,
  path: string,
): Promise<{ path: string; history: FileTouch[] }> {
  return getJson(
    `/api/file-history?repo=${encodeURIComponent(repo)}&path=${encodeURIComponent(path)}`,
  );
}

/** One file's patches, newest first — fetched only when the diff dialog opens. */
export function loadDiffs(
  repo: string,
  path: string,
  limit = 10,
): Promise<{ path: string; diffs: FileDiff[] }> {
  const params = new URLSearchParams({ repo, path, limit: String(limit) });
  return getJson(`/api/diff?${params.toString()}`);
}

export function loadCommits(
  repo: string,
  opts: { author?: string; path?: string; q?: string; limit?: number } = {},
): Promise<{ commits: Commit[] }> {
  const params = new URLSearchParams({ repo });
  if (opts.author) params.set("author", opts.author);
  if (opts.path) params.set("path", opts.path);
  if (opts.q) params.set("q", opts.q);
  if (opts.limit) params.set("limit", String(opts.limit));
  return getJson(`/api/commits?${params.toString()}`);
}

/** Fires a plain GET so the Test Matrix can assert an endpoint answers. */
export function probe<T>(url: string): Promise<T> {
  return getJson<T>(url);
}

/** A repository's whole file listing — one request, at its default branch. */
export function loadTree(repo: string, ref?: string): Promise<RepoTree> {
  const params = new URLSearchParams({ repo });
  if (ref) params.set("ref", ref);
  return getJson<RepoTree>(`/api/tree?${params.toString()}`);
}

/** Branch and tag names, for the ref picker. */
export function loadRefs(repo: string): Promise<RepoRefs> {
  return getJson<RepoRefs>(`/api/refs?repo=${encodeURIComponent(repo)}`);
}

/** One tag's release notes, or the commit it points at when it has none. */
export function loadTag(repo: string, tag: string): Promise<TagDetail> {
  const params = new URLSearchParams({ repo, tag });
  return getJson<TagDetail>(`/api/tag?${params.toString()}`);
}

/** One file's text, fetched only when the reader opens it. */
export function loadFile(repo: string, path: string, ref?: string): Promise<FileContent> {
  const params = new URLSearchParams({ repo, path });
  if (ref) params.set("ref", ref);
  return getJson<FileContent>(`/api/file?${params.toString()}`);
}

/**
 * One file's bytes — for images, video and downloads. The token has to travel
 * as a header, so this cannot be a plain `src` attribute; callers get a Blob and
 * hand back an object URL.
 */
export async function loadRaw(repo: string, path: string, ref?: string): Promise<Blob> {
  const params = new URLSearchParams({ repo, path });
  if (ref) params.set("ref", ref);
  const res = await fetch(`/api/raw?${params.toString()}`, { headers: prefHeaders() });
  if (!res.ok) throw new ApiError(`Request failed (${res.status})`, res.status);
  return res.blob();
}

/** One pull request or issue, with its commits, reviews and comments merged. */
export function loadTrack(repo: string, number: number, kind: ItemKind): Promise<TrackedItem> {
  return getJson<TrackedItem>(
    `/api/track?repo=${encodeURIComponent(repo)}&number=${number}&kind=${kind}`,
  );
}

/** A repository's pull requests and issues, newest activity first. */
export function loadItems(
  repo: string,
  state: ItemState,
  limit = 50,
): Promise<{ items: ItemSummary[] }> {
  const params = new URLSearchParams({ repo, state, limit: String(limit) });
  return getJson(`/api/items?${params.toString()}`);
}

/**
 * Headers every call to this deployment carries: the bring-your-own token and
 * the edge-cache TTL. Both are the browser's, never the deployment's.
 */
function prefHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    [CACHE_TTL_HEADER]: String(getPrefs().cacheTtlSeconds),
  };
  const token = getToken();
  if (token) headers[TOKEN_HEADER] = token;
  return headers;
}

async function getJson<T>(url: string): Promise<T> {
  const [pathname, search] = url.split("?");
  const started = performance.now();
  let res: Response;
  try {
    res = await fetch(url, { headers: prefHeaders() });
  } catch (err) {
    record({
      method: "GET",
      target: pathname ?? url,
      kind: "api",
      status: "ERR",
      ok: false,
      latency: Math.round(performance.now() - started),
      params: Object.fromEntries(new URLSearchParams(search ?? "")),
      result: { error: err instanceof Error ? err.message : String(err) },
    });
    throw new ApiError("Network request failed", 0);
  }

  const latency = Math.round(performance.now() - started);
  const body = (await res.json().catch(() => null)) as unknown;
  const message =
    body && typeof body === "object" && "error" in body
      ? String((body as { error: unknown }).error)
      : `Request failed (${res.status})`;

  record({
    method: "GET",
    target: pathname ?? url,
    kind: "api",
    status: statusLabel(res.status, res.ok),
    ok: res.ok,
    latency,
    params: Object.fromEntries(new URLSearchParams(search ?? "")),
    result: summarize(res.ok ? body : { error: message }),
  });

  if (!res.ok) throw new ApiError(message, res.status);
  return body as T;
}

/* ---------------------------------------------------------------------- MCP */

interface McpCallResult {
  ok: boolean;
  status: string;
  latency: number;
  tool: string;
  args: Record<string, unknown>;
  /** The tool's own payload, unwrapped from the JSON-RPC text block. */
  payload: unknown;
  /** The untouched JSON-RPC envelope. */
  raw: unknown;
}

const MCP_HEADERS = {
  "content-type": "application/json",
  accept: "application/json, text/event-stream",
};

async function postMcp(body: unknown): Promise<{
  ok: boolean;
  status: string;
  latency: number;
  raw: unknown;
  error?: string;
}> {
  const started = performance.now();
  try {
    const res = await fetch("/mcp", {
      method: "POST",
      headers: { ...MCP_HEADERS, ...prefHeaders() },
      body: JSON.stringify(body),
    });
    const raw = (await res.json().catch(() => null)) as unknown;
    return {
      ok: res.ok,
      status: statusLabel(res.status, res.ok),
      latency: Math.round(performance.now() - started),
      raw,
    };
  } catch (err) {
    return {
      ok: false,
      status: "ERR",
      latency: Math.round(performance.now() - started),
      raw: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Unwraps `{ result: { content: [{ type: "text", text }] } }` into plain data. */
function unwrapToolResult(raw: unknown, ok: boolean): unknown {
  if (!ok || raw === null || typeof raw !== "object") return raw;
  const envelope = raw as { result?: unknown; error?: unknown };
  if (envelope.error !== undefined) return envelope.error;
  if (envelope.result === undefined) return raw;

  const content = (envelope.result as { content?: unknown }).content;
  if (Array.isArray(content)) {
    for (const block of content) {
      if (block && typeof block === "object" && (block as { type?: string }).type === "text") {
        const text = (block as { text?: unknown }).text;
        if (typeof text === "string") {
          try {
            return JSON.parse(text);
          } catch {
            return text;
          }
        }
      }
    }
  }
  return envelope.result;
}

function rpcFailed(raw: unknown): boolean {
  return (
    raw !== null && typeof raw === "object" && (raw as { error?: unknown }).error !== undefined
  );
}

export async function callMcpTool(
  tool: string,
  args: Record<string, unknown>,
): Promise<McpCallResult> {
  const result = await postMcp({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name: tool, arguments: args },
  });

  const payload = unwrapToolResult(result.raw, result.ok);
  const ok = result.ok && !rpcFailed(result.raw);

  record({
    method: "tools/call",
    target: tool,
    kind: "mcp",
    status: result.status,
    ok,
    latency: result.latency,
    params: args,
    result: summarize(result.error ? { error: result.error } : payload),
  });

  return {
    ok,
    status: result.status,
    latency: result.latency,
    tool,
    args,
    payload,
    raw: result.raw,
  };
}

interface McpToolList {
  ok: boolean;
  status: string;
  latency: number;
  tools: string[];
}

export async function listMcpTools(): Promise<McpToolList> {
  const result = await postMcp({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} });
  const listed = (result.raw as { result?: { tools?: Array<{ name?: unknown }> } } | null)?.result
    ?.tools;
  const tools = Array.isArray(listed)
    ? listed.map((t) => String(t?.name ?? "")).filter(Boolean)
    : [];

  record({
    method: "tools/list",
    target: "system.list_capabilities",
    kind: "mcp",
    status: result.status,
    ok: result.ok && tools.length > 0,
    latency: result.latency,
    params: {},
    result: summarize({ tools }),
  });

  return { ok: result.ok, status: result.status, latency: result.latency, tools };
}
