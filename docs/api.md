# git-trace HTTP API

The Worker is a read-only JSON API over GitHub. The dashboard consumes it; every
endpoint also answers `curl`. There is no write path and no server-side state
beyond the edge cache.

Base URL: your deployment, or `http://localhost:8787` with `bun run dev:worker`.

```sh
curl "http://localhost:8787/api/trace?repo=rjoydip/git-trace"
```

## Headers

| Header           | Meaning                                                                   |
| ---------------- | ------------------------------------------------------------------------- |
| `x-github-token` | The caller's own GitHub token. Absent means anonymous (60 requests/hour). |
| `x-cache-ttl`    | Edge-cache lifetime in seconds. Default 300; `0` disables caching.        |

Both are per request. The deployment stores no GitHub credentials, so the token
in a cached response key is a hash — a private-repo response cannot be served to
another caller. Errors are never cached. GitHub's own quota applies per token
(5000 requests/hour) or per IP (60).

## Repository parameter

`?repo=` accepts `owner/name` or a GitHub URL, on every endpoint. Omitting it is
a `400`:

```json
{ "error": "No repository: pass ?repo=owner/name", "status": 400 }
```

`limit` parameters are clamped to a per-endpoint maximum rather than rejected;
a negative or non-numeric value falls back to the default.

## Errors

Failures keep GitHub's status code and a JSON body:

```json
{ "error": "Not Found", "status": 404 }
```

Known paths under `/api/` that do not exist return `404 {"error":"Not found"}`.
Anything outside `/api/` is a static asset.

## Endpoints

| Endpoint                                         | Returns                                              |
| ------------------------------------------------ | ---------------------------------------------------- |
| `GET /api/health`                                | `{ status, timestamp }`                              |
| `GET /api/config`                                | `{ cacheTtlSeconds }` — the deployment's default TTL |
| `GET /api/trace?repo=`                           | `TracePayload` — everything the dashboard renders    |
| `GET /api/repo?repo=`                            | `RepoSummary`                                        |
| `GET /api/stats?repo=&limit=`                    | `TraceStats`                                         |
| `GET /api/commits?repo=&path=&author=&q=&limit=` | `{ commits: Commit[] }`                              |
| `GET /api/contributors?repo=`                    | `{ contributors: AuthorRollup[] }`                   |
| `GET /api/hot-files?repo=&limit=`                | `{ files: HotFile[] }`                               |
| `GET /api/file-history?repo=&path=`              | `{ path, history: FileTouch[] }`                     |
| `GET /api/diff?repo=&path=&limit=`               | `{ path, diffs: FileDiff[] }`                        |
| `GET /api/tree?repo=&ref=`                       | `RepoTree`                                           |
| `GET /api/refs?repo=`                            | `RepoRefs`                                           |
| `GET /api/tag?repo=&tag=`                        | `TagDetail`                                          |
| `GET /api/file?repo=&path=&ref=`                 | `FileContent`                                        |
| `GET /api/raw?repo=&path=&ref=`                  | The file's bytes                                     |
| `GET /api/activity?repo=&since=&until=&limit=`   | `{ activity: ActivityBucket[] }`                     |
| `GET /api/track?repo=&number=&kind=&limit=`      | `TrackedItem`                                        |
| `GET /api/items?repo=&state=&limit=`             | `{ items: ItemSummary[] }`                           |

## Endpoint notes

### `/api/trace`

The dashboard's one call. One commit-list request plus one shared detail pass
feeds stats, contributors, hot files, activity and the co-change graph — about
33 GitHub requests cold, zero while the edge cache is warm.

```json
{
  "repo": "owner/name",
  "meta": { "fullName": "owner/name", "stars": 12, "defaultBranch": "main", "...": "..." },
  "stats": { "commits": 100, "authors": 8, "additions": 1200, "...": "..." },
  "commits": [],
  "contributors": [],
  "hotFiles": [],
  "activity": [],
  "fileGraph": { "nodes": [], "links": [] }
}
```

### `/api/commits`

`limit` defaults to 30 and caps at 100. `path`, `author` and `q` are optional;
`q` searches only the page that GitHub returned. There is no `since`/`until`
here — the dashboard filters client-side; the CLI and MCP tool accept dates and
filter locally.

### `/api/stats`, `/api/contributors`, `/api/hot-files`, `/api/activity`

Bounded windows, by design:

| Endpoint       | Window                                                        |
| -------------- | ------------------------------------------------------------- |
| `stats`        | The latest 100 commits (`limit` overrides, max 100)           |
| `contributors` | The latest 100 commits, merged with GitHub's contributor list |
| `hot-files`    | The latest 30 commit detail passes (`limit` default 20)       |
| `activity`     | The latest 100 commits, bucketed by calendar day              |

### `/api/raw`

Streams GitHub's bytes untouched, with:

- `content-type` from the file extension (`src/core/media.ts`);
- `content-disposition: inline` for images, video and audio, `attachment` for
  everything else — repository HTML can never execute on this origin;
- `x-content-type-options: nosniff`;
- `cache-control: private, max-age=<x-cache-ttl>`.

### `/api/file`

Inlines text up to GitHub's 1 MB limit. Above that, or for binary files,
`text` is `null` and `url` points at GitHub.

### `/api/track`

`kind` is `pull` (default) or `issue`; `number` is required and must be a
positive integer. `limit` bounds timeline entries (default 20, max 100).
`activity` merges commits, review verdicts and comments, newest first.

### `/api/items`

`state` is `open` (default), `closed` or `all`. `limit` defaults to 50, max 100.
Pull requests and issues come back in one list, newest activity first.

## Payload shapes

The canonical definitions live in [`src/core/types.ts`](../src/core/types.ts);
these are the ones worth knowing at a glance.

```ts
interface RepoSummary {
  fullName: string;
  description: string | null;
  stars: number;
  forks: number;
  openIssues: number;
  defaultBranch: string;
  language: string | null;
  url: string;
}

interface TraceStats {
  commits: number;
  authors: number;
  filesTouched: number;
  additions: number;
  deletions: number;
  firstCommit: string | null;
  lastCommit: string | null;
}

interface Commit {
  sha: string;
  shortSha: string;
  message: string;
  subject: string;
  author: { name: string; email: string; login?: string; avatar?: string };
  date: string;
  url: string;
  parents: string[];
}

interface AuthorRollup {
  name: string;
  email: string;
  login?: string;
  avatar?: string;
  commits: number;
  lastCommit: string;
}

interface HotFile {
  path: string;
  commits: number;
  additions: number;
  deletions: number;
  churn: number;
}

interface ActivityBucket {
  date: string; // YYYY-MM-DD
  count: number;
}

interface FileTouch {
  sha: string;
  shortSha: string;
  date: string;
  author: string;
  subject: string;
  status: "added" | "modified" | "removed" | "renamed";
  additions: number;
  deletions: number;
}

interface RepoTree {
  repo: string;
  ref: string;
  entries: Array<{ path: string; type: "blob" | "tree"; size: number; sha: string }>;
  truncated: boolean;
}

interface RepoRefs {
  defaultBranch: string;
  branches: string[];
  tags: string[];
}

interface TagDetail {
  repo: string;
  tag: string;
  kind: "release" | "commit";
  title: string;
  body: string | null;
  author: string | null;
  publishedAt: string | null;
  url: string;
  prerelease: boolean;
  sha: string | null;
}

interface TrackedItem {
  kind: "pull" | "issue";
  repo: string;
  number: number;
  title: string;
  body: string;
  state: "open" | "closed";
  draft: boolean;
  merged: boolean;
  author: { login: string; avatar: string | null };
  labels: Array<{ name: string; color: string }>;
  comments: number;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  mergedAt: string | null;
  url: string;
  base: string | null; // pull requests only
  head: string | null; // pull requests only
  additions: number;
  deletions: number;
  changedFiles: number;
  commitCount: number;
  activity: Array<{
    id: string;
    kind: "commit" | "comment" | "review";
    actor: { login: string; avatar: string | null };
    at: string;
    text: string;
    url: string | null;
  }>;
}
```

## Related

- [`docs/cli.md`](./cli.md) — the same data in a terminal, including `--json`.
- [`docs/mcp.md`](./mcp.md) — the same service as MCP tools.
- [`README.md`](../README.md) — deployment, rate limits and the dashboard.
