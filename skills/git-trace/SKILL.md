---
name: git-trace
description: Use when a question is about a GitHub repository's history, churn, hotspots, ownership, activity, file evolution, pull requests, issues, or release context, and the GitTrace MCP server is available. Guides cost-aware tool selection and bounded-window reporting.
---

# GitTrace

GitTrace answers history questions from the GitHub REST API. It is read-only,
GitHub-only, and every call names its own repository. There is no default repo
and no local checkout.

## Preflight

1. Normalize the repository to `owner/name` (a GitHub URL also works).
2. Decide the window and limit before calling. “Recent” is not a window.
3. If the repository is private or requests are rate-limited, the MCP client
   must send a token header:

   ```json
   {
     "mcpServers": {
       "git-trace": {
         "url": "https://<worker-host>/mcp",
         "headers": { "x-github-token": "<token>" }
       }
     }
   }
   ```

   Never print the token. Anonymous access is 60 requests/hour; a token raises
   it to 5,000/hour and unlocks private repositories.

4. Responses are cached at the edge for ~5 minutes by default. Repeating the
   same call within the TTL is cheap; a new head commit invalidates the detail
   cache.

## Cost and window

| Tool                 |                   GitHub requests | Actual window                                                                                          |
| -------------------- | --------------------------------: | ------------------------------------------------------------------------------------------------------ |
| `trace_commits`      |                                 1 | default 30, max 100; `path`/`author`/`since`/`until` are server-side; `q` scans only the returned page |
| `trace_activity`     |                                 1 | latest 100 commits; `since`/`until` bound the returned buckets, not the fetch                          |
| `trace_contributors` |                                 2 | latest 100 commits                                                                                     |
| `trace_items`        |                                 1 | latest 50 by default, max 100                                                                          |
| `trace_pull_request` |                                 4 | item timeline                                                                                          |
| `trace_issue`        |                                 2 | item + comment excerpts                                                                                |
| `trace_repository`   |                               ~32 | latest 100 commits, 30 commit details                                                                  |
| `trace_hot_files`    |                               ~31 | latest 30 commits                                                                                      |
| `trace_file_history` | ~31 cold, ~cached after hot files | latest 30 commits                                                                                      |

Two cold detail-heavy calls can exhaust the anonymous hourly quota. Prefer the
cheapest tool that answers the question.

## Recipes

### Repository pulse

Use `trace_activity` for the shape of the latest 100 commits, then
`trace_commits` with explicit `since`/`until` for an exact window, and
`trace_contributors` for ownership. Skip `trace_repository` unless repository
metadata is also needed.

### Churn and risk

1. `trace_hot_files(repo, limit: 15)` — call this first; it warms the 30-commit
   detail cache.
2. `trace_file_history(repo, path)` for the top two or three paths.
3. `trace_commits(repo, path, limit: 30)` for narrative context.

Report churn as “within the latest 30 commits,” never as all-time. Recommend
tests/refactoring only where the evidence supports it.

### Ownership

`trace_contributors` ranks recent authors. Use `trace_commits(author: ...)` to
see what an author changed, and `trace_file_history` on hot paths to see who
touched them. Do not infer ownership from a single commit.

### File archaeology

`trace_file_history(repo, path)` lists commits touching the file within the
latest 30 commits, with additions/deletions. It does not return patches and
does not scan full history. For older or exact changes, use
`trace_commits(path, since, until)` or the commit URL. Never claim the returned
list is complete history.

### Pull requests and issues

1. `trace_items(repo, state: "open" | "closed" | "all")`.
2. Filter by `kind`, title, labels, or number in the result.
3. `trace_pull_request` or `trace_issue` with that number.

`trace_pull_request` gives size, labels, review verdicts, commits, and timeline
excerpts — not changed-file paths or patches. `trace_issue` gives comment
excerpts, not full comment bodies. Do not promise a file-level review from these
tools alone.

### Release context

Use `trace_commits` with `since`/`until` and collect PR numbers from commit
subjects/merge messages, then trace those PRs. There is no refs/tags tool in the
current MCP surface; do not invent tag data.

## Output contract

- State the repository, window, and limit used.
- Cite short SHA, path, date, and author for claims.
- Say when data is truncated or bounded (“latest 30 commits”, “top 15 by churn”).
- Summarize the top results; do not dump raw JSON into the answer.
- Use the `url` fields when linking to GitHub.
- Distinguish “no matches” from “not enough history was fetched.”

## Errors

- `ERROR:` responses are plain text, not JSON.
- 400: invalid repository or missing path.
- 403/429 with “rate limit”: ask for a token; do not retry blindly.
- 404: private or unknown repository; a token may be required.
- 422: the number is a pull request when `trace_issue` was called (or vice versa).

## Avoid

- Calling `trace_repository` merely to validate a repository.
- Calling `trace_hot_files` and `trace_file_history` in parallel on a cold cache;
  they duplicate the same detail pass.
- Using `trace_activity` for a window older than the latest 100 commits.
- Claiming full-history or all-time results from bounded tools.
- Using GitTrace for local/unpushed history; use local git for that.
