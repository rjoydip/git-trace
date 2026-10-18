# git-trace

Trace a Git repository's history — commits, contributors, activity, and hot
files.

The core promise: point it at a repository and see where it changes most, who
changes it, and how a given file got to where it is. The MCP server answers the
same questions for coding agents; the dashboard shows them to people. Both call
one shared `TraceService`, so they never disagree.

## How it deploys

A single Worker serves three things:

```sh
                     ┌──────────────────────────── Cloudflare Worker ───┐
  browser  ────────▶ │  static assets (dist/web)   ← the shadcn dashboard │
  agent    ────────▶ │  /mcp   → MCP (Streamable HTTP, stateless)         │
  client   ────────▶ │  /api/* → Hono JSON API                            │
                     └───────────────┬───────────────────────────────────┘
                                     ▼
                             GitHub REST API
```

No database, no git binary, no long-lived state: repository history comes from
the GitHub REST API. That is what makes it deployable as a pure Worker.

## Layout

```sh
src/
  core/
    types.ts      shared domain types
    github.ts     fetch client over the GitHub REST API + parseRepo()
    trace.ts      pure analysis: rollups, activity, hot files, file history
    service.ts    TraceService — the single source of truth for API + MCP
    trace.test.ts unit tests for the pure analysis
  mcp/server.ts   MCP tools/resources/prompt over the shared service
  worker/index.ts Hono app: /api/*, /mcp, static assets
  web/            shadcn dashboard (React + Tailwind v4, 10-tab control room)
vite.config.ts         dashboard build (dist/web)
wrangler.toml          Worker entry + assets
.github/workflows/     CI (check + build) · Deploy (Cloudflare)
```

Only the dashboard has a build step. Wrangler bundles `src/worker/index.ts`
itself, so the Worker is never a build artifact you have to keep in sync.

## Setup

```sh
bun install
bun run check          # format:check && lint && typecheck && test
```

Dev mode — two shells, no build step, and both sides reload on save:

```sh
bun run dev:worker     # Worker on http://127.0.0.1:8787 — reloads on every src/ save
bun run dev            # dashboard on http://127.0.0.1:5173 — Vite HMR
```

Open **http://127.0.0.1:5173**. Vite proxies `/api` and `/mcp` to the Worker, so
the whole app — including the Simulator and the Tests tab — works against the
live Worker without compiling anything. `wrangler dev` watches the Worker's
module graph, so editing `src/worker`, `src/core` or `src/mcp` restarts it in
place. (In dev the Worker serves only `/api` and `/mcp`; its assets point at
`src/web/public`, so don't browse the dashboard on :8787.)

## Deploy

There is nothing to configure on the deployment itself — no repository, no
token, no vars. Every request names its own repository, and a visitor's GitHub
token and edge-cache TTL travel as request headers.

**Through CI** (recommended). `.github/workflows/deploy.yml` builds the dashboard
and runs `wrangler deploy` on every push to `main`, or on demand from the
Actions tab. Add two repository secrets first:

| Secret                  | Where to find it                                                                    |
| ----------------------- | ----------------------------------------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`  | Cloudflare dashboard → My Profile → API Tokens → _Edit Cloudflare Workers_ template |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard → Workers & Pages → Account ID                                 |

`.github/workflows/ci.yml` runs on every push and pull request: format, lint,
types, tests, then a build that bundles the Worker and dry-run deploys it — so a
broken entry point fails CI rather than the deploy.

**From your machine:**

```sh
bun run build          # builds the dashboard, then dry-run bundles the Worker
bun run deploy         # wrangler deploy: bundles src/worker/index.ts + dist/web
```

## Dashboard

A "control room" SPA (`src/web`), built from shadcn primitives on Tailwind v4
and bound to the JSON API. One tab opens a repository, five explore it, three
exercise the deployment itself, one tracks a single pull request or issue.

**Overview** is the entry point: it holds the repository target, the four
headline metrics (commits traced, contributors, files touched, churn) and the
zero-token prompt export. Every other tab reads the trace it opens.

| Tab          | What it shows                                                                                                                                     |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Overview     | Repository target, the four headline metrics, the repo summary and the zero-token prompt export                                                   |
| Commits      | A chronological timeline filterable by window, text, author, order and count, with an activity strip                                              |
| Comments     | Every traced commit message in full, filterable by body, text, author, order and count — the same filter set as Commits                           |
| PR / Issue   | Pull requests and issues filtered by state, kind and text — open one for its size, labels, review verdicts and timeline                           |
| Contributors | Pick an author, trace their commits, inspect the raw JSON response                                                                                |
| Hot Files    | Churn ranking by kind, a pannable/zoomable co-change knowledge graph with per-node detail, per-row diffs and file history, export in four formats |
| Simulator    | Fire a real `tools/call` at `/mcp` — `repo` is pinned to the traced target — and read the tool payload back                                       |
| Telemetry    | Every request the dashboard made — filterable, paged, exportable in four formats, with per-event detail                                           |
| Tests        | Smoke-checks the MCP transport, the JSON API and the trace pipeline — per-suite pass/fail, latency and failures, exportable                       |
| Docs         | MCP client config, the exposed-tools reference, and live deployment info                                                                          |

Nothing is traced until you name a repository — there is no server-side default.
The header collapses to two rows below `lg`: brand and actions on the first, a
horizontally scrolling tab strip on the second. Data tables scroll rather than
compress, and every grid is single-column on a phone.

`tabs`, `dialog` and `select` are the Radix-backed shadcn implementations;
`card`, `button`, `badge`, `input`, `textarea`, `table` and `skeleton` are the
local shadcn sources.

The Commits tab's window dropdown (`All time` / 90 / 30 / 7 days) narrows the
timeline and the activity strip. It is a view over what was already fetched, so
changing it costs no GitHub requests.

The PR / Issue tab lists the repository's pull requests and issues from one
`/api/items` call — GitHub serves both from the issues collection, so the state
filter is the only server-side one; kind and text filter in the browser. Picking
a row loads the full record below it.

The Telemetry Stream is fed by `src/web/lib/telemetry.ts`, a small store the
`api` module records into; Simulator and Tests therefore show up in it for free.
"Live" fires a real `trace_activity` tool call every 15s.

`/api/config` reports the deployment's default `cacheTtlSeconds`; the Settings
dialog shows it next to the per-browser override, so it is clear what a visitor
who changes nothing gets.

### Brand and installability

The mark in `src/web/components/brand.tsx` is mirrored by
`public/favicon.svg` and `public/maskable.svg` (a full-bleed square for Android's
mask), so the tab icon and the header logo cannot drift apart.

`public/manifest.webmanifest` plus `public/sw.js` make it installable. The worker
is network-first and never touches `/api` or `/mcp` — cached JSON would lie —
falling back to the last good response and then the cached shell when offline.
It registers in production builds only, since in dev it would pin the Vite
module graph.

### Theming

Dark and light plus a ten-colour accent palette, both stored in `localStorage`
and applied by an inline script in `index.html` before first paint (so neither
flashes).

Two ideas keep it small, both in `src/web/tailwind.css`:

- **Light mode is a remap of the zinc ramp.** Tailwind v4 compiles `bg-zinc-900`
  to `background-color: var(--color-zinc-900)`, so overriding the ramp under
  `html.light` re-themes every component at once. The `-400` status tints get
  darker `-600`/`-700` variants, which is all the contrast work light mode needs.
- **The accent is one `--accent-base` hex** mixed into a ramp with `color-mix()`.
  Every `indigo-*` utility is aliased onto that ramp, so the palette picker
  rewrites a single variable and buttons, active tabs, links and focus rings all
  follow it. `src/web/lib/theme.ts` owns the store and the storage keys.

Animation is CSS-only (no motion library): tab panels rise, card grids stagger,
dialogs and selects pop, and horizontal bars grow from the left — all disabled
under `prefers-reduced-motion: reduce`.

## MCP server

The endpoint is `https://<worker-host>/mcp` (Streamable HTTP, stateless).
Client config:

```json
{
  "mcpServers": {
    "git-trace": {
      "url": "https://<worker-host>/mcp"
    }
  }
}
```

Tools:

| Tool                 | Purpose                                                     |
| -------------------- | ----------------------------------------------------------- |
| `trace_repository`   | Repository metadata + headline commit/author/churn stats    |
| `trace_commits`      | List/search commits, optionally by path, author or date     |
| `trace_contributors` | Rank contributors with avatars and last-commit date         |
| `trace_hot_files`    | Rank files by churn — where the repo changes most           |
| `trace_file_history` | One file's commits with diff stats                          |
| `trace_activity`     | Commits per calendar day over a window                      |
| `trace_pull_request` | One pull request: state, size, reviews, commits, discussion |
| `trace_issue`        | One issue: state, labels, author, body, comment thread      |

Resource: `git-trace://repository/summary`. Prompt: `history-review`.

Every tool requires `repo` (`"owner/name"` or a GitHub URL) — there is no server-side default.

## JSON API

| Endpoint                                         | Purpose                                         |
| ------------------------------------------------ | ----------------------------------------------- |
| `GET /api/config`                                | Deployment default cache TTL                    |
| `GET /api/trace?repo=`                           | Everything the dashboard needs, in one pass     |
| `GET /api/repo?repo=`                            | Repository metadata                             |
| `GET /api/stats?repo=`                           | Commit/author/churn headline stats              |
| `GET /api/commits?repo=&path=&author=&q=&limit=` | Filtered commits                                |
| `GET /api/contributors?repo=`                    | Contributor rollup                              |
| `GET /api/hot-files?repo=&limit=`                | Churn ranking                                   |
| `GET /api/file-history?repo=&path=`              | A file's commits                                |
| `GET /api/diff?repo=&path=&limit=`               | A file's patches, newest first                  |
| `GET /api/activity?repo=&since=&until=`          | Daily commit counts                             |
| `GET /api/track?repo=&number=&kind=`             | One pull request or issue with its timeline     |
| `GET /api/items?repo=&state=&limit=`             | Pull requests and issues, newest activity first |
| `GET /api/health`                                | Liveness                                        |

## Rate limits

This is the thing to get right before deploying.

**Bring your own token.** The deployment holds no GitHub credentials at all, so
an anonymous visitor gets GitHub's **60 requests/hour per IP** — one dashboard
load can exhaust that (see the table below). Settings → GitHub token takes a
token in the browser, keeps it in local storage, and sends it per request as the
`x-github-token` header; nothing is written on the deployment, and the token buys
**5000 requests/hour** plus private repositories. The edge-cache key carries a
hash of the token, so a cached private-repo response can never be served to a
different (or anonymous) request.

Every visitor authenticates for themselves, and an MCP client sends the same
`x-github-token` header. A token you want nobody else to use should not be the
one you paste into a shared deployment.

Two design choices keep the request count down:

- **One aggregate request.** The dashboard calls `/api/trace` once. The server fetches each commit's details a single time and shares them between the stats and hot-file views — previously those were two separate 30-request passes.
- **Edge caching.** Successful GitHub GETs are cached (`caches.default`, no binding needed) for the TTL this browser asks for — `x-cache-ttl`, set in Settings, default 300 seconds; `Off` disables it. Reloading the dashboard then costs **zero** GitHub requests. Errors are never cached, so a rate-limited response cannot get stuck.

Cold dashboard load for one repository:

| Step                                                                | Requests |
| ------------------------------------------------------------------- | -------- |
| Repository metadata                                                 | 1        |
| Commit list (100, feeds stats/contributors/activity)                | 1        |
| Contributors                                                        | 1        |
| Commit details (`DETAIL_COMMIT_LIMIT`, shared by stats + hot files) | 30       |
| **Total**                                                           | **~33**  |

Raise `DETAIL_COMMIT_LIMIT` in `src/core/service.ts` for deeper history; the
`ponytail:` marker names it and the KV-cache upgrade path.

## Limitations

- **Read-only, public history.** No writes, no local repositories, no git
  binary. A private repo requires a token with read access.
- **Bounded windows.** Contributor and hot-file views cover the most recent
  100 and 30 commits respectively, not all of history.
- **Edge cache only.** Responses are cached at the edge for a few minutes
  (configurable via `GITHUB_CACHE_TTL`); there is no shared KV cache across
  PoPs. Fine for a dashboard, and the seam is `GitHubClient.get`.
- **GitHub only.** GitLab/Bitbucket would be another client behind the same
  `TraceService` interface.
