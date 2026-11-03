---
name: git-trace-review
description: Use when reviewing a pull request, diff, or completed change in the git-trace repository. Runs the project's real gate (bun run check and build), verifies each maintainer instruction and PR claim against the diff with file:line evidence, and returns pass/partial/fail verdicts instead of opinions.
---

# Reviewing a change in git-trace

Green CI is necessary, not sufficient. A review is done when every claim and
every maintainer instruction has a verdict backed by evidence.

If you have not collected the instructions yet, run the
[`git-trace-preflight`](../git-trace-preflight/SKILL.md) steps first.

## 1. Establish what was claimed

Collect the task description, the issue/PR comments, and the actual diff:

```sh
git diff origin/main...HEAD --stat
git diff origin/main...HEAD
git log --oneline origin/main..HEAD
```

List the claims in the description and the instructions in the thread. Each one
is a checklist row; each row needs a place in the diff that satisfies it.

## 2. Run the real gate

```sh
bun run check   # format:check + oxlint --deny-warnings + tsc --noEmit + bun test
bun run build   # web + worker + cli
```

Quote the numbers (`N tests pass`) and the failing command's output verbatim.
Do not run `bun test` separately first — `check` includes it.

## 3. Checks by touched area

| Touched                     | Also verify                                                                                                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/cli/**`                | `bun run docs:cli` leaves no diff; a new flag is in `args.ts`, the command and `docs/cli.md`; TTY view is rendered, piped output is Markdown; `--json` payload unchanged |
| `src/cli/commands/files.ts` | `tree` still draws a tree (`├──` / `└──`), not a flat list                                                                                                               |
| `src/worker/**` route       | Route documented in `docs/api.md` — `test/docs.test.ts` enforces it                                                                                                      |
| `src/mcp/server.ts`         | Tool documented in `docs/mcp.md`; the tool-count assertion still matches                                                                                                 |
| `src/core/**`               | Pure logic has a test; unit tests make no network calls                                                                                                                  |
| `src/web/**`                | Typecheck covers it; no new dependency without a reason in the PR                                                                                                        |
| `test/**`                   | Tests live under `test/`, imports point at `../src/...`, no test left in `src/`                                                                                          |
| `package.json`              | New dependency justified against `PLAN.md` (stdlib and native first)                                                                                                     |
| `README.md` / `PLAN.md`     | Changed only if user-visible behaviour or the plan changed                                                                                                               |

Regenerate, do not hand-edit, `docs/cli.md` — a mismatch means someone edited
the file instead of the option spec.

## 4. Verdicts, not vibes

One row per instruction and per claim:

```text
| Instruction / claim              | Verdict | Evidence                          |
| "keep it dependency-free"        | pass    | package.json diff empty           |
| "tree must be ASCII, not a list" | pass    | test/render.test.ts:96 asserts └── |
| "document the new flag"          | fail    | docs/cli.md has no --since        |
```

Verdicts are `pass`, `partial`, `fail`, `not verifiable`. "Looks fine" is not a
verdict; name the file, line or command that proves it.

## 5. Review order

Behaviour → tests → docs → naming → formatting. The formatter owns style; do
not leave comments about whitespace or import order.

## 6. Comment contract

- One finding per comment: `file:line`, what breaks, the smallest fix.
- Separate **must fix** from **nit**; only "must fix" blocks.
- Tie a must-fix to the instruction, test or rule that makes it one.
- Never approve a diff you did not run.

## Avoid

- Approving because CI is green — CI does not read the thread.
- Reviewing only the files named in the description.
- Asking for a test that already exists; search `test/` first.
- Re-opening a decision the issue thread already settled.
