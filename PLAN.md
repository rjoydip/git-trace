# git-trace — Implementation Plan

## 1. Vision

Trace a Git repository's history from anywhere: a shadcn dashboard for people,
an MCP server for agents, a JSON API for everything else, and a CLI for
terminals — deployed as a single Cloudflare Worker, with the CLI also running
entirely in-process.

Answer questions like:

- Where does this repository change most, and which files are hot?
- When is it most active, and who owns the hot areas?
- How did this file get to its current state?

## 2. Technology decisions

| Area                      | Decision                                   | Why                                                   |
| ------------------------- | ------------------------------------------ | ----------------------------------------------------- |
| Language                  | TypeScript, strict                         | Shared types across core, Worker, dashboard           |
| Runtime / package manager | Bun                                        | Fast installs, `bun test`, one toolchain              |
| Worker                    | Hono                                       | Typed routing; first-class on Workers                 |
| MCP transport             | `WebStandardStreamableHTTPServerTransport` | Runs on Workers; stateless                            |
| Dashboard                 | React + Tailwind v4 + shadcn               | Requested; consistent component language              |
| Charts                    | Hand-rolled SVG/CSS                        | No chart dependency for one bar chart                 |
| Data source               | GitHub REST API (`fetch`)                  | No git binary, no database — pure Worker              |
| Storage                   | None                                       | History is derived on read; caching is a later opt-in |
| Tests                     | `bun test`                                 | One runnable check for the pure core                  |
| CLI                       | In-process adapter, no new dependencies    | Same `TraceService` as the API and MCP; works offline |
| CLI output                | Rendered on a TTY, Markdown when piped     | Readable in a terminal, paste-ready for an agent      |
| CLI packaging             | `bun build --target=node`                  | One `dist/cli/index.js` plus a `bin` entry            |
| Deploy                    | `wrangler` (Worker + static assets)        | One deployable unit                                   |

**Design principle.** The trace engine (rollups, activity, churn, file history)
depends on nothing but plain data. MCP, the API and the CLI are thin adapters
over the same `TraceService`; the dashboard is an adapter over `/api/*`.

## 3. Architecture

```
terminal      ──▶ src/cli  ─┐
coding agents ──▶ /mcp     ─┼─▶ TraceService ─▶ GitHubClient ─▶ GitHub REST API
browser       ──▶ /api/*   ─┤        │
browser       ──▶ assets   ─┘        └─▶ trace.ts (pure analysis)
```

- `TraceService` is the only thing that talks to GitHub; every adapter calls it.
- `trace.ts` holds the pure functions and is unit-tested without network.
- The CLI imports `TraceService` directly — no HTTP hop — so it runs offline
  against `bun run emulate`; `--api` only changes the GitHub API base.
- The Worker is stateless: one MCP transport per request, no sessions.

## 4. Data model

- `Commit` — sha, subject, author (`name`/`email`/`login`/`avatar`), date, parents.
- `CommitDetail` — a commit plus `files[]` (status, additions, deletions) and totals.
- `AuthorRollup` — one author's commit count and last-commit date.
- `ActivityBucket` — commits per calendar day (zero-filled).
- `HotFile` — path, commits touching it, additions, deletions, churn.
- `FileTouch` — one commit's change to one file.
- `TraceStats` — commits, authors, files touched, additions, deletions, span.

## 5. Feature plan

### Phase 1 — Core (done)

- [x] GitHub client (repo, commits, commit detail, contributors).
- [x] Pure analysis: `summarize`, `rollupAuthors`, `activityTimeline`, `hotFiles`,
      `fileHistory`, `searchCommits`, `mergeContributors`.
- [x] `TraceService` shared by API and MCP.
- [x] Unit tests for the pure analysis.

### Phase 2 — MCP server (done)

- [x] `trace_repository`, `trace_commits`, `trace_contributors`,
      `trace_hot_files`, `trace_file_history`, `trace_activity`.
- [x] Resource `git-trace://repository/{owner}/{name}/summary`; prompt `history-review`.
- [x] Streamable HTTP, stateless, on `/mcp`.

### Phase 3 — Dashboard (done)

- [x] Header with a repository input (`owner/name` or URL).
- [x] Stat cards, activity chart, contributors, hot files, commit table.
- [x] Click a hot file to trace its history.
- [x] Loading / empty / error states.

### Phase 4 — Cloudflare deployment (done)

- [x] Single Worker: static assets + `/api/*` + `/mcp`.
- [x] `wrangler.toml` with the assets binding and SPA fallback — no vars, and no default repository.
- [x] No server-side credentials: the visitor's own token reaches GitHub through a request header.

### Phase 5 — CLI (done)

Everything the dashboard shows, in a terminal, plus the local GitHub emulator
for offline runs.

- [x] In-process adapter over `TraceService` — no Worker, no HTTP hop, and no
      disagreement with the dashboard's numbers.
- [x] One command per tab: `trace`; `commits`/`commit`/`comments`;
      `contributors`/`hot-files`/`activity`; `items`/`track`;
      `tree`/`refs`/`tag`/`file-history`; `prompt`; `mcp list|call|config`;
      `doctor`; `docs`.
- [x] `tree` draws an ASCII file tree, not a flat list; `activity --watch`
      polls until Ctrl+C.
- [x] Output: rendered text on a TTY (bold headings, aligned tables, colour);
      Markdown when piped, so an agent gets headings, GFM tables and bullets;
      `--md` / `--text` override; `--json` is the scripting contract.
- [x] Auth ladder: `--token` → `GITHUB_TOKEN` → `GH_TOKEN` → `gh auth token` →
      anonymous. `login` runs `gh auth login --web` when `gh` is installed,
      otherwise opens the token page; a 401 or rate limit names that next step.
- [x] `--verbose` logs every GitHub request to stderr, never stdout.
- [x] Optional `~/.config/git-trace/config.json` (or `$XDG_CONFIG_HOME`) sets
      one default, `api`; flags and the environment win.
- [x] Packaging: `bun run build:cli` bundles `src/cli/index.ts` to
      `dist/cli/index.js` for Node, exposed as the `git-trace` bin.
- [x] No new dependencies: `node:util` `parseArgs`, a small ANSI palette, string
      renderers.
- [x] Reference docs: [`docs/cli.md`](docs/cli.md) generated from the same option
      specs as `--help`; [`docs/api.md`](docs/api.md) and
      [`docs/mcp.md`](docs/mcp.md) kept honest by coverage tests.
- [x] `doctor` probes the read paths and exits non-zero on failure.

## 6. Deliberate non-goals (for now)

Named so they are decisions, not omissions:

- No database — history is derived on read. Add D1/KV only when a cache is
  actually needed (see the `ponytail:` marker in `service.ts`).
- No full-history scan — bounded windows (100 contributors, 30 hot-file commits).
- No write operations — read-only by construction.
- No auth on the API — it exposes only public data; add a token gate before
  serving private repositories publicly.
- No file contents or media in the CLI — the Files viewer stays in the browser;
  `file-history` is history, not a file dump.
- No co-change graph rendering — the data is in `fileGraph`; `--json` exposes it.
- No interactive TUI or shell completion — later, if the CLI earns it.
- No npm publish yet — the package is private, but `build:cli` and `bin` are
  ready if that changes.

## 7. Next steps (when asked)

1. KV cache in front of `GitHubClient` (cut the per-load request count).
2. Configurable `DETAIL_COMMIT_LIMIT` and full-history pagination.
3. Additional providers (GitLab, Bitbucket) behind the same service.
4. Co-change analysis: files that consistently change together.
5. A `trace_symbol` tool bridging history and code.
6. Publish the CLI to npm once the package is no longer private.

## 8. Definition of done (met)

- [x] `bun run check` passes: format, lint, typecheck, tests.
- [x] `bun run build` produces `dist/web` and dry-run bundles the Worker from `src/worker/index.ts`.
- [x] Dashboard and MCP return the same numbers for the same repository.
- [x] The CLI returns them too, from the same `TraceService`: `bun run build:cli`
      produces the bin, TTY/Markdown/`--json` modes are covered, and the
      emulator-backed integration test runs the real binary.
- [x] Deploys to Cloudflare as one Worker with no external services.
