/**
 * `--verbose`: the Telemetry tab, for one run. Wraps `fetch` so every GitHub
 * request is visible without threading a hook through `GitHubClient`, and
 * writes to stderr so `--json 2>/dev/null` stays parseable.
 */
export function logRequests(): void {
  const original = globalThis.fetch;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const started = performance.now();
    const method = init?.method ?? "GET";
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const label = `${method} ${shorten(url)}`;

    try {
      const response = await original(input, init);
      const ms = Math.round(performance.now() - started);
      process.stderr.write(`${label} ${response.status} ${ms}ms\n`);
      return response;
    } catch (err) {
      const ms = Math.round(performance.now() - started);
      process.stderr.write(`${label} ERR ${ms}ms\n`);
      throw err;
    }
  }) as typeof fetch;
}

/** Host and path, without the query string — enough to recognise the call. */
function shorten(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname}`;
  } catch {
    return url;
  }
}
