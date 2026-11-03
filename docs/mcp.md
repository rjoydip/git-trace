# git-trace MCP server

The Worker hosts a [Model Context Protocol](https://modelcontextprotocol.io)
server at `GET|POST /mcp` (Streamable HTTP). It is stateless: each request gets
a fresh server and transport, so any MCP client can connect to any isolate
without sticky sessions.

Local: `http://localhost:8787/mcp` (`bun run dev:worker`).
Deployed: `https://<worker-host>/mcp`.

## Client config

```json
{
  "mcpServers": {
    "git-trace": {
      "type": "http",
      "url": "https://<worker-host>/mcp"
    }
  }
}
```

`git-trace mcp config --url https://<worker-host>` prints this snippet, and
`git-trace mcp list` / `git-trace mcp call` exercise the same server in-process
(see [`docs/cli.md`](./cli.md)). The dashboard's MCP tab does the same.

## Headers

Identical to the HTTP API:

| Header           | Meaning                                                    |
| ---------------- | ---------------------------------------------------------- |
| `x-github-token` | The caller's own token; absent means anonymous, 60 req/hr. |
| `x-cache-ttl`    | Edge-cache TTL in seconds; default 300, `0` disables.      |

## Tools

Every tool takes `repo` (an `owner/name` string or a GitHub URL) and has no
server-side default. Results are JSON in the first `content[].text` block. A
tool-side failure returns `isError: true` with `ERROR: <message>` in that block
rather than a JSON-RPC error.

| Tool                 | Required args    | Purpose                                                 |
| -------------------- | ---------------- | ------------------------------------------------------- |
| `trace_repository`   | `repo`           | Metadata plus headline commit/author/churn stats        |
| `trace_commits`      | `repo`           | List and search commits, optionally filtered            |
| `trace_contributors` | `repo`           | Rank contributors with avatars and last-commit date     |
| `trace_hot_files`    | `repo`           | Rank files by churn — where the repository changes most |
| `trace_file_history` | `repo`, `path`   | One file's commits with per-commit diff stats           |
| `trace_activity`     | `repo`           | Commits per calendar day over a window                  |
| `trace_items`        | `repo`           | Pull requests and issues, newest activity first         |
| `trace_pull_request` | `repo`, `number` | One pull request: size, reviews, commits, discussion    |
| `trace_issue`        | `repo`, `number` | One issue: state, labels, author, body, comments        |

### `trace_repository`

Summarizes a repository and costs about 32 GitHub requests.

| Arg    | Type   | Notes                              |
| ------ | ------ | ---------------------------------- |
| `repo` | string | Required. `owner/name` or full URL |

### `trace_commits`

| Arg      | Type   | Notes                                              |
| -------- | ------ | -------------------------------------------------- |
| `repo`   | string | Required                                           |
| `path`   | string | Only commits touching this path                    |
| `author` | string | GitHub login or email                              |
| `q`      | string | Free text over subject, author and sha (page only) |
| `since`  | string | ISO date; commits on or after                      |
| `until`  | string | ISO date; commits on or before                     |
| `limit`  | number | 1–100, default 30                                  |

`q` searches only the page that GitHub returned, not all of history.

### `trace_contributors`

| Arg    | Type   | Notes    |
| ------ | ------ | -------- |
| `repo` | string | Required |

Ranks over the latest 100 commits, merged with GitHub's contributor list.

### `trace_hot_files`

| Arg     | Type   | Notes             |
| ------- | ------ | ----------------- |
| `repo`  | string | Required          |
| `limit` | number | 1–100, default 20 |

Churn is additions + deletions across the latest 30 commit details — a bounded
window, not all of history.

### `trace_file_history`

| Arg     | Type   | Notes                                   |
| ------- | ------ | --------------------------------------- |
| `repo`  | string | Required                                |
| `path`  | string | Required. Repository-relative file path |
| `limit` | number | 1–200, default 50                       |

### `trace_activity`

| Arg     | Type   | Notes                            |
| ------- | ------ | -------------------------------- |
| `repo`  | string | Required                         |
| `since` | string | ISO date; start of the window    |
| `until` | string | ISO date; end of the window      |
| `limit` | number | 1–100 commit window, default 100 |

### `trace_items`

| Arg     | Type   | Notes                             |
| ------- | ------ | --------------------------------- |
| `repo`  | string | Required                          |
| `state` | enum   | `open` (default), `closed`, `all` |
| `limit` | number | 1–100, default 50                 |

Use the returned `number` with `trace_pull_request` or `trace_issue`.

### `trace_pull_request`

| Arg      | Type   | Notes                              |
| -------- | ------ | ---------------------------------- |
| `repo`   | string | Required                           |
| `number` | number | Required, positive                 |
| `limit`  | number | 1–100 timeline entries, default 20 |

### `trace_issue`

| Arg      | Type   | Notes                      |
| -------- | ------ | -------------------------- |
| `repo`   | string | Required                   |
| `number` | number | Required, positive         |
| `limit`  | number | 1–100 comments, default 20 |

## Resource

`git-trace://repository/{owner}/{name}/summary` returns
`application/json`: the repository's metadata and headline stats, the same
payload as `trace_repository`.

## Prompt

`history-review` takes an optional `repo` argument and returns a review prompt
that asks the model to use `trace_activity`, `trace_hot_files` and
`trace_contributors`, then summarize activity, hotspots, ownership and gaps.

## JSON-RPC

Discover the tools:

```json
{ "jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {} }
```

Call one:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "trace_hot_files",
    "arguments": { "repo": "rjoydip/git-trace", "limit": 5 }
  }
}
```

```sh
curl -s https://<worker-host>/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"trace_hot_files","arguments":{"repo":"rjoydip/git-trace"}}}'
```

## Related

- [`docs/api.md`](./api.md) — the HTTP JSON API behind the same `TraceService`.
- [`docs/cli.md`](./cli.md) — `git-trace mcp list|call|config`.
- [`skills/git-trace/SKILL.md`](../skills/git-trace/SKILL.md) — cost, window and
  output guidance for answering history questions.
- [`skills/git-trace-preflight/SKILL.md`](../skills/git-trace-preflight/SKILL.md)
  — duplicate check and thread instructions before changing this repo.
- [`skills/git-trace-review/SKILL.md`](../skills/git-trace-review/SKILL.md) —
  the review gate and per-area checks.
