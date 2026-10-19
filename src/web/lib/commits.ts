/**
 * The Commits tab's filter set, kept out of the component so it can be tested
 * without a DOM. Every filter runs over commits already fetched — the window,
 * the author, the text and the order cost no extra GitHub requests.
 */
import type { Commit } from "../../core/types";

export type CommitOrder = "newest" | "oldest";

interface CommitFilters {
  author: string;
  query: string;
  order: CommitOrder;
  /** When true, keep only commits that carry a message body. */
  hasBody?: boolean;
}

/** How a commit's author is labelled in the timeline and its author filter. */
export function commitAuthor(commit: Commit): string {
  return commit.author.login ?? commit.author.name;
}

/** Everything a commit says beyond its subject line — its message body. */
export function commitBody(commit: Commit): string {
  return commit.message.slice(commit.subject.length).trim();
}

/** Authors present in the window, most active first. */
export function authorTallies(commits: Commit[]): Array<{ name: string; count: number }> {
  const counts = new Map<string, number>();
  for (const commit of commits) {
    const name = commitAuthor(commit);
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** Author + body + free text + order, applied to one window of commits. */
export function filterCommits(commits: Commit[], filters: CommitFilters): Commit[] {
  const { author, query, order, hasBody } = filters;
  const needle = query.trim().toLowerCase();
  const hits = commits.filter((commit) => {
    if (hasBody && commitBody(commit) === "") return false;
    if (author !== "all" && commitAuthor(commit) !== author) return false;
    if (!needle) return true;
    return [commit.subject, commit.message, commit.shortSha, commit.sha, commitAuthor(commit)]
      .join("\n")
      .toLowerCase()
      .includes(needle);
  });
  return order === "newest" ? hits : hits.reverse();
}
