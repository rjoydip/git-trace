# git-trace CLI

A repository's history in a terminal: the numbers the dashboard shows,
without a browser, a deployment, or (against `bun run emulate`) a token.

## Install

```sh
bun install
bun run build:cli       # dist/cli/index.js, the `git-trace` bin
bun run cli --help      # or run it straight from source
```

## Usage

```sh
git-trace <command> <owner/name> [options]
```

Output is Markdown when piped — headings, GFM tables and bullets, ready for
a prompt or an issue — and the rendered view on a terminal: bold headings,
aligned tables, colour. `--md` and `--text` override either way.

Defaults may come from `~/.config/git-trace/config.json` — `api` only; flags
and the environment win over it.

## Global options

| Flag                      | Meaning                                                     |
| ------------------------- | ----------------------------------------------------------- |
| `-r, --repo <owner/name>` | Repository, when it is not the first positional             |
| `--token <token>`         | GitHub token (else GITHUB_TOKEN, GH_TOKEN, `gh auth token`) |
| `--api <url>`             | GitHub API base (else GITHUB_API_URL, then api.github.com)  |
| `--json`                  | Print the raw payload instead of a report                   |
| `--md`                    | Markdown even on a terminal (implied when piped)            |
| `--text`                  | Aligned text, even when piped                               |
| `--color`                 | Force colour                                                |
| `--no-color`              | Disable colour                                              |
| `-v, --verbose`           | Log GitHub requests to stderr                               |
| `-h, --help`              | Show help for the command                                   |
| `-V, --version`           | Show the version                                            |

## Commands

### `git-trace trace`

Overview: metadata, headline metrics, top contributors and hot files

```sh
git-trace trace <owner/name> [--limit <n>] [--json]
```

| Flag              | Meaning                                  |
| ----------------- | ---------------------------------------- |
| `-n, --limit <n>` | Commits to sample (default 100, max 100) |

### `git-trace commits`

Commit timeline, filterable by path, author, text and date

```sh
git-trace commits <owner/name> [--path <p>] [--author <u>] [--q <text>] [--body]
```

| Flag                       | Meaning                                |
| -------------------------- | -------------------------------------- |
| `--path <path>`            | Only commits touching this path        |
| `--author <login>`         | Only commits by this user              |
| `--since <date>`           | ISO date or YYYY-MM-DD                 |
| `--until <date>`           | ISO date or YYYY-MM-DD                 |
| `--sha <ref>`              | Branch or tag to walk                  |
| `--q <text>`               | Substring over message, author and sha |
| `--order <newest\|oldest>` | Default newest                         |
| `--body`                   | Print full commit messages             |
| `-n, --limit <n>`          | Rows (default 30, max 100)             |

### `git-trace commit`

One commit: message, stats and changed files

```sh
git-trace commit <owner/name> <sha>
```

Takes no options of its own.

### `git-trace comments`

Full commit messages, newest first

```sh
git-trace comments <owner/name> [--author <u>] [--order newest|oldest]
```

| Flag                       | Meaning                    |
| -------------------------- | -------------------------- |
| `--author <login>`         | Only this author           |
| `--order <newest\|oldest>` | Default newest             |
| `-n, --limit <n>`          | Rows (default 30, max 100) |

### `git-trace contributors`

Authors ranked by commit count

```sh
git-trace contributors <owner/name> [--limit <n>]
```

| Flag              | Meaning                    |
| ----------------- | -------------------------- |
| `-n, --limit <n>` | Rows (default 20, max 100) |

### `git-trace hot-files`

Files ranked by churn over the sampled commits

```sh
git-trace hot-files <owner/name> [--limit <n>]
```

| Flag              | Meaning                    |
| ----------------- | -------------------------- |
| `-n, --limit <n>` | Rows (default 10, max 100) |

### `git-trace activity`

Commits per day, as a table or a bar chart

```sh
git-trace activity <owner/name> [--days <n>] [--since <date>] [--until <date>] [--bar] [--watch]
```

| Flag                   | Meaning                                        |
| ---------------------- | ---------------------------------------------- |
| `-d, --days <n>`       | Window ending today (default 30; --since wins) |
| `--since <date>`       | ISO date or YYYY-MM-DD                         |
| `--until <date>`       | ISO date or YYYY-MM-DD                         |
| `--bar`                | Draw a bar per day instead of a table          |
| `--watch`              | Poll and redraw until Ctrl+C                   |
| `--interval <seconds>` | Watch interval (default 15, min 5)             |

### `git-trace items`

Pull requests and issues, newest activity first

```sh
git-trace items <owner/name> [--state open|closed|all] [--kind pull|issue]
```

| Flag                          | Meaning                    |
| ----------------------------- | -------------------------- |
| `--state <open\|closed\|all>` | Default open               |
| `--kind <pull\|issue>`        | Default both               |
| `-n, --limit <n>`             | Rows (default 50, max 100) |

### `git-trace track`

One pull request or issue: state, numbers and timeline

```sh
git-trace track <owner/name> <number> [--kind pull|issue]
```

| Flag                   | Meaning                                             |
| ---------------------- | --------------------------------------------------- |
| `--kind <pull\|issue>` | Default pull                                        |
| `-n, --limit <n>`      | Commits, reviews and comments to fetch (default 20) |

### `git-trace tree`

The repository's files as an ASCII tree at one ref

```sh
git-trace tree <owner/name> [--ref <branch|tag>] [--dirs] [--filter <glob>]
```

| Flag              | Meaning                                     |
| ----------------- | ------------------------------------------- |
| `--ref <ref>`     | Branch or tag (default: the default branch) |
| `--dirs`          | Directories only                            |
| `--filter <glob>` | Keep paths matching a glob, e.g. 'src/*'    |

### `git-trace refs`

Branches and tags

```sh
git-trace refs <owner/name>
```

Takes no options of its own.

### `git-trace tag`

One tag's release notes, or the commit it points at

```sh
git-trace tag <owner/name> <tag>
```

Takes no options of its own.

### `git-trace file-history`

The commits that touched one path

```sh
git-trace file-history <owner/name> <path> [--limit <n>]
```

| Flag              | Meaning                    |
| ----------------- | -------------------------- |
| `-n, --limit <n>` | Rows (default 50, max 200) |

### `git-trace prompt`

Zero-token context digest of the repository's history

```sh
git-trace prompt <owner/name> [--full]
```

| Flag     | Meaning                                |
| -------- | -------------------------------------- |
| `--full` | Every contributor, hot file and commit |

### `git-trace mcp`

MCP tools and client config (list, call, config)

```sh
git-trace mcp <list|call|config> [tool] [--args <json>] [--url <origin>]
```

| Flag             | Meaning                                  |
| ---------------- | ---------------------------------------- |
| `--args <json>`  | Tool arguments as JSON (call)            |
| `--raw`          | Print the whole JSON-RPC result envelope |
| `--url <origin>` | Server origin for `config`               |

### `git-trace doctor`

Probe the read paths the dashboard uses

```sh
git-trace doctor <owner/name>
```

Takes no options of its own.

### `git-trace login`

Sign in to GitHub with `gh`, or get a token URL

```sh
git-trace login [--no-open]
```

| Flag        | Meaning                                   |
| ----------- | ----------------------------------------- |
| `--no-open` | Print the token URL instead of opening it |

### `git-trace docs`

Endpoints, runtime facts and the MCP client config

```sh
git-trace docs [--url <origin>]
```

| Flag             | Meaning                          |
| ---------------- | -------------------------------- |
| `--url <origin>` | Server origin for the MCP config |

## Exit codes

| Code | Meaning                                                  |
| ---- | -------------------------------------------------------- |
| `0`  | Success                                                  |
| `1`  | GitHub or runtime error; message on stderr               |
| `2`  | Usage error: unknown command, bad flag, missing argument |

## Related

- [`docs/api.md`](./api.md) — the HTTP JSON API behind every command
- [`docs/mcp.md`](./mcp.md) — MCP tools, resource and prompt
