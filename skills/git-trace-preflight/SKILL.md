---
name: git-trace-preflight
description: Use before fixing a bug, implementing a feature, opening a pull request, or reviewing a change in the git-trace repository. Checks whether an issue or pull request already covers the work, and extracts the instructions maintainers left in issue/PR comments and review threads into a checklist you must satisfy.
---

# Preflight: is it already done, and what did they ask for?

The ticket text is rarely the whole requirement. Before writing code, prove the
work is not already reported or merged, and collect every instruction a
maintainer left in the thread.

## 1. Is it already reported or fixed?

Search **both states and both kinds** — open and closed, issues and pull
requests. A closed PR is the most common duplicate.

```sh
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)

git-trace items "$REPO" --state all --kind issue
git-trace items "$REPO" --state all --kind pull
gh search issues --repo "$REPO" "<keywords>"
gh search prs --repo "$REPO" "<keywords>"
git-trace commits "$REPO" --q "<keyword>" --limit 50
```

Use real keywords: the error text, the symbol or file path, the feature noun.
Searching the feature name alone misses a PR titled after the fix.

| What you found                    | What to do                                             |
| --------------------------------- | ------------------------------------------------------ |
| Open PR implements it             | Review or comment on it; do not open a duplicate.      |
| Merged PR or commit implements it | Cite the SHA/PR and stop, unless this is a regression. |
| Open issue describes it           | Reference it (`Closes #N`); do not re-describe it.     |
| Closed as wontfix / stale         | Say so, quote the reason, ask before overriding it.    |
| Nothing, after both searches      | Say "no issue or PR for X" and list the queries used.  |

Absence of evidence is a claim too: name the searches that justify it.

## 2. Read the whole item, not the body

```sh
git-trace track "$REPO" <n> --kind pull --limit 100
gh issue view <n> --repo "$REPO" --comments
gh pr view <n> --repo "$REPO" --comments
gh api "repos/$REPO/pulls/<n>/comments"   # inline review comments
gh api "repos/$REPO/pulls/<n>/reviews"    # review verdicts and bodies
```

Read in this order: body → comments oldest to newest → review threads,
including resolved ones → linked issues. A later comment overrides an earlier
one; the newest maintainer statement wins.

## 3. Turn instructions into a checklist

Every maintainer directive becomes a row with the exact quote, author and link:

```text
Instructions to satisfy
- [ ] "keep it dependency-free"            — @octocat, <comment url>
- [ ] "add a test for the empty tree case" — @mona,   <comment url>
- [ ] "don't add a new /api route"         — @hubot,  <review url>
```

Signals to treat as instructions: "must", "please", "don't", "instead", "use",
"add", "remove", "rename", "test", "before merging", "LGTM once". A `nit:` is
optional — label it as such rather than silently dropping it.

Do not paraphrase a constraint into something weaker. "No new dependency" stays
"no new dependency", not "prefer the existing one".

## 4. Report before coding

```text
Duplicate check: none | #41 (open PR) | abc1234 (merged)
Instructions to satisfy: <count>
- ...
Open questions: ...
```

Then implement. Re-read the thread before opening the PR — instructions are
often added while work is in progress.

## Avoid

- Searching only open items, or only issues.
- Treating the PR description as the full specification.
- Claiming "already implemented" from a title; open the diff or the commit.
- Dropping a reviewer instruction because it was inconvenient, without saying so.
