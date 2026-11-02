# git-trace CLI — plan

## 1. Goal

Everything the dashboard answers, from a terminal: what a repository's history
looks like, who owns it, which files are hot, and where one pull request or
issue sits — without a browser, a deployment, or a GitHub token when you point
it at the local emulator.

```sh
git-trace trace rjoydip/git-trace
git-trace hot-files vercel/next.js --limit 5
git-trace track rjoydip/git-trace 2 --kind pull
git-trace commits . --author mona --since 30d --json
```

**Non-goals** (deliberate, see §10): rendering file contents or media, the file
co-change graph as ASCII art, the browser telemetry history, and the Tests tab
as an interactive matrix.

## 2. Design principle

The dashboard is one adapter over `TraceService`. MCP is another. The CLI is a
third, and it should stay thin the same way:

```
dashboard ──▶ /api/*  ─┐
MCP       ──▶ /mcp    ─┼─▶ TraceService ─▶ GitHubClient ─▶ GitHub REST API
CLI       ──▶ render  ─┘
```

- **In-process by default.** The CLI imports `TraceService` and calls it
  directly — no HTTP hop, so it works offline against `bun run emulate`, needs
  no Worker running, and cannot drift from the web app's numbers.
- **`--api <url>` opts into client mode** for the deployed Worker (edge cache,
  no local token), speaking exactly the `/api/*` contract the dashboard uses.
- **No React imports.** `src/cli` may import `src/core` only; the web stays the
  only consumer of `src/web`.
- **One shared prompt builder.** `buildContextPrompt` currently lives inside
  `dashboard.tsx`; move it to `src/core/prompt.ts` so the CLI's `prompt` command
  and the dashboard's "Copy LLM Context Prompt" cannot disagree. Add one unit
  test for it.

## 3. Command map — every tab, translated

| Web tab      | What it shows                            | CLI                                             |
| ------------ | ---------------------------------------- | ----------------------------------------------- |
| Overview     | meta, 4 headline metrics, prompt export  | `git-trace trace <repo>`                        |
| Commits      | timeline, filters, per-commit detail     | `git-trace commits`, `git-trace commit <sha>`   |
| Comments     | full commit messages                     | `git-trace comments`                            |
| PR / Issue   | one PR/issue: commits, reviews, comments | `git-trace track <number>`, `git-trace items`   |
| Contributors | ranked by commit count                   | `git-trace contributors`                        |
| Hot Files    | churn ranking                            | `git-trace hot-files`                           |
| Files        | tree, refs, tag detail, (file body)      | `git-trace tree`, `refs`, `tag`, `file-history` |
| Simulator    | MCP tools list / call                    | `git-trace mcp list`, `git-trace mcp call`      |
| Telemetry    | in-browser request log                   | `--verbose` on any command                      |
| Tests        | endpoint probe matrix                    | `git-trace doctor`                              |
| Docs         | MCP client config, deployment facts      | `git-trace docs`, `git-trace mcp config`        |

Deliberately absent: the Files tab's viewer (`file`, `raw`), because the ask is
"everything except the file contents". `file-history` stays — it is history, not
a file dump.

## 4. Option reference

This table is the contract: `--help` prints it, and `docs/cli.md` is generated
from the same option specs in `src/cli/args.ts`, so the two cannot drift.

### Global

| Flag                | Default          | Meaning                                                                |
| ------------------- | ---------------- | ---------------------------------------------------------------------- |
| `<repo>`            | —                | Positional `owner/name` or a GitHub URL                                |
| `-r, --repo <repo>` | positional       | Same, for scripts that prefer flags                                    |
| `--token <token>`   | env              | GitHub token; see §6 for resolution order                              |
| `--api <url>`       | off              | Call a Worker's `/api/*` instead of running in-process                 |
| `--json`            | off              | Print the service payload verbatim (stable for scripts)                |
| `--md`              | piped            | Markdown output; implied when stdout is not a TTY                      |
| `--no-color`        | off              | Also honours `NO_COLOR`                                                |
| `-n, --limit <n>`   | command-specific | Row cap, clamped per command                                           |
| `--cache-ttl <s>`   | `0`              | In-process response cache; `0` disables (in-process has no edge cache) |
| `-v, --verbose`     | off              | Request log to stderr: method, path, status, ms (the Telemetry tab)    |
| `-h, --help`        | —                | Usage; `git-trace help <command>` for one command                      |
| `-V, --version`     | —                | Package version                                                        |

### Commands

| Command               | Options                                                                                                                                |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `trace`               | `--limit` (commits sampled, default 100)                                                                                               |
| `commits`             | `--path <p>`, `--author <login>`, `--since <date>`, `--until <date>`, `--sha <ref>`, `--limit <n>`, `--order newest\|oldest`, `--body` |
| `commit <sha>`        | `--files` (file list + stats, on by default in text mode)                                                                              |
| `comments`            | `--author`, `--order`, `--limit`, `--body` (always)                                                                                    |
| `contributors`        | `--limit`                                                                                                                              |
| `hot-files`           | `--limit` (default 10)                                                                                                                 |
| `activity`            | `--since`, `--until`, `--days <n>` (default 30), `--bar` (sparkline)                                                                   |
| `items`               | `--state open\|closed\|all`, `--kind pull\|issue`, `--limit`                                                                           |
| `track <number>`      | `--kind pull\|issue` (default `pull`), `--limit` (commits/reviews/comments)                                                            |
| `tree`                | `--ref <branch\|tag>`, `--dirs` (directories only), `--filter <glob>`                                                                  |
| `refs`                | —                                                                                                                                      |
| `tag <tag>`           | `--notes` (release body)                                                                                                               |
| `file-history <path>` | `--limit`                                                                                                                              |
| `prompt`              | `--full` (include commit list; default caps it)                                                                                        |
| `mcp list`            | —                                                                                                                                      |
| `mcp call <tool>`     | `--args '<json>'`, repeated `--arg k=v`, `--raw`                                                                                       |
| `mcp config`          | `--api <url>`                                                                                                                          |
| `doctor`              | `--json`                                                                                                                               |
| `docs`                | `[topic]` — prints the reference offline                                                                                               |

### Exit codes

| Code | When                                                      |
| ---- | --------------------------------------------------------- |
| `0`  | Success                                                   |
| `1`  | GitHub or runtime error (message on stderr)               |
| `2`  | Usage error — unknown command, bad flag, missing argument |

A 403/429 from GitHub keeps code `1` but prints the same "add a token" hint the
dashboard shows, since that is the most common first-run failure.

## 5. Output rules

- **TTY** → aligned tables, ANSI colour, relative dates (`3d ago`), the same
  ranking order the web uses. A `trace` prints the four headline metrics, the
  date span, then the top five of each list.
- **Piped** → Markdown (headings + tables), so `git-trace trace x | pbcopy` is
  paste-ready. `--md` forces it on a TTY.
- **`--json`** → the exact `TraceService` payload, no wrapper, no colour, no
  progress. This is the scripting contract and what the tests pin.
- `--verbose` writes to **stderr**, never stdout, so `--json 2>/dev/null` stays
  parseable.

## 6. Auth and configuration

Resolution order, first match wins:

1. `--token`
2. `GITHUB_TOKEN`
3. `GH_TOKEN`
4. `gh auth token` (only if `gh` is on `PATH`; failure is silent)
5. anonymous — prints the 60/hour hint once on stderr when a call is close to
   the limit

No `auth login` command of our own: the GitHub CLI already owns that, and the
emulator accepts any token.

Config file (`~/.config/git-trace/config.json`, P3) is optional and holds only
defaults for `api`, `limit`, `cache-ttl`; environment and flags override it.

## 7. Layout

```
src/cli/
  index.ts        entry: parse, dispatch, map errors to exit codes
  args.ts         option specs + usage strings — the single source for --help
  config.ts       token/config resolution (§6)
  log.ts          --verbose request logger
  render.ts       table / markdown / json writers, colour + TTY detection
  commands/
    trace.ts  commits.ts  commit.ts  comments.ts  contributors.ts
    hot-files.ts  activity.ts  items.ts  track.ts  tree.ts  refs.ts
    tag.ts  file-history.ts  prompt.ts  mcp.ts  doctor.ts  docs.ts
test/
  args.test.ts    parse table, usage output
  render.test.ts  snapshot of a fixture payload in all three modes
```

`package.json` gains `"cli": "bun run src/cli/index.ts"` for development. For a
real `npx git-trace`, `build:cli` bundles to `dist/cli/index.js` (Node target)
and `bin` points there; publishing is an open question (§11) since the package is
private today.

Dependencies: **none.** `node:util` `parseArgs` handles flags, `node:util`
`styleText` handles colour, and the renderers are ~150 lines of string building.

## 8. Phases

| Phase | Scope                                                                      | Done when                                                       |
| ----- | -------------------------------------------------------------------------- | --------------------------------------------------------------- |
| P0    | skeleton: `parseArgs`, `--help`, `--version`, `trace`, `--json`            | `git-trace trace octocat/trace-demo` works against the emulator |
| P1    | all read commands, human + JSON renderers, exit codes                      | every row of §3 covered; `--json` matches the API payload       |
| P2    | `prompt`, `mcp list\|call\|config`, `doctor`, `docs`, `--verbose`          | Simulator, Tests and Docs tabs have a CLI home                  |
| P3    | `build:cli`, `bin`, README section, generated `docs/cli.md`, Windows check | `npx`-style invocation works; docs match `--help`               |

P1 is one pull request; P0 is its first commit so the branch is usable early.

## 9. Testing

- **`args.test.ts`** — the parse table: every flag, unknown flag → exit 2,
  repeated `--arg`, `--json` implications. No network.
- **`render.test.ts`** — one fixture payload rendered as table, Markdown and
  JSON; snapshot the strings so column drift is caught.
- **Command tests** — start `createEmulator({ service: "github" })` from the
  emulator branch's fixture, run `trace/commits/track` against it, assert counts
  and shapes (not box drawing). This is the reason the emulator work landed
  first.
- `bun run check` stays the gate; the CLI adds no new toolchain.

## 10. What the CLI will not do

- **File contents and media** — the Files tab viewer stays in the browser.
- **The co-change graph** — data is available (`fileGraph`), but ASCII/Unicode
  graph layout is its own project; `--json` exposes the data meanwhile.
- **Browser telemetry history** — `--verbose` logs _this_ run; there is no
  cross-run store.
- **Live streaming / "Paused" mode** — `activity --watch` is a P2 nice-to-have,
  not v1.
- **Interactive TUI, shell completion** — later, if the CLI earns it.

## 11. Open questions

1. **Client mode or local engine by default?** This plan picks in-process for
   zero setup and offline use; `--api` covers the deployed Worker. The trade is
   that the CLI needs a token for real GitHub traffic.
2. **Publish to npm?** Not while the package is private. `build:cli` makes it
   possible later without changing the commands.
3. **Markdown when piped, or only on `--md`?** Piped-Markdown matches the
   reference CLI and makes copy-paste pleasant; it also surprises anyone
   expecting plain rows. Leaning piped.
4. **`activity --watch`** — interval, and whether it exits non-zero if the
   repository goes idle.
