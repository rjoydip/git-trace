import type {
  ActivityBucket,
  Commit,
  CommitDetail,
  Contributor,
  FileChange,
  FileDiff,
  FileLink,
  FileNode,
  HotFile,
  TrackedActivity,
  TrackedComment,
  TrackedReview,
  TraceStats,
} from "./types";

/** One author's rollup over a set of commits. */
export interface AuthorRollup {
  name: string;
  email: string;
  login?: string;
  avatar?: string;
  commits: number;
  lastCommit: string;
}

/** Aggregate headline stats over a commit list. */
export function summarize(commits: Commit[]): TraceStats {
  const authors = new Set<string>();
  const dates = commits
    .map((c) => c.date)
    .filter(Boolean)
    .sort();
  for (const c of commits) authors.add(c.author.email || c.author.name);
  return {
    commits: commits.length,
    authors: authors.size,
    filesTouched: 0,
    additions: 0,
    deletions: 0,
    firstCommit: dates[0] ?? null,
    lastCommit: dates[dates.length - 1] ?? null,
  };
}

/** Per-author rollup, most commits first. */
export function rollupAuthors(commits: Commit[]): AuthorRollup[] {
  const byKey = new Map<string, AuthorRollup>();
  for (const c of commits) {
    const key = c.author.email || c.author.name;
    const existing = byKey.get(key);
    if (existing) {
      existing.commits += 1;
      if (c.date > existing.lastCommit) existing.lastCommit = c.date;
    } else {
      byKey.set(key, {
        name: c.author.name,
        email: c.author.email,
        ...(c.author.login ? { login: c.author.login } : {}),
        ...(c.author.avatar ? { avatar: c.author.avatar } : {}),
        commits: 1,
        lastCommit: c.date,
      });
    }
  }
  return [...byKey.values()].sort((a, b) => b.commits - a.commits);
}

/**
 * Commits per calendar day over [since, until] (inclusive), zero-filled so the
 * dashboard can draw a continuous timeline without gaps.
 */
export function activityTimeline(
  commits: Commit[],
  since?: string,
  until?: string,
): ActivityBucket[] {
  const counts = new Map<string, number>();
  for (const c of commits) {
    const day = c.date.slice(0, 10);
    if (!day) continue;
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  const days = [...counts.keys()].sort();
  const start = since?.slice(0, 10) ?? days[0];
  const end = until?.slice(0, 10) ?? days[days.length - 1];
  if (!start || !end) return days.map((date) => ({ date, count: counts.get(date) ?? 0 }));

  const buckets: ActivityBucket[] = [];
  for (
    let d = new Date(`${start}T00:00:00Z`);
    d.toISOString().slice(0, 10) <= end;
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    const date = d.toISOString().slice(0, 10);
    buckets.push({ date, count: counts.get(date) ?? 0 });
  }
  return buckets;
}

/**
 * Rank files by churn across commit details. `files` are the per-commit file
 * lists (each detail call is one request — callers should bound how many they
 * fetch; see the worker's HOT_FILE_COMMIT_LIMIT).
 */
export function hotFiles(details: CommitDetail[], limit = 20): HotFile[] {
  const byPath = new Map<string, HotFile>();
  for (const detail of details) {
    for (const file of detail.files) {
      const entry = byPath.get(file.filename) ?? {
        path: file.filename,
        commits: 0,
        additions: 0,
        deletions: 0,
        churn: 0,
      };
      entry.commits += 1;
      entry.additions += file.additions;
      entry.deletions += file.deletions;
      entry.churn = entry.additions + entry.deletions;
      byPath.set(file.filename, entry);
    }
  }
  return [...byPath.values()]
    .sort((a, b) => b.churn - a.churn || b.commits - a.commits)
    .slice(0, limit);
}

export interface FileTouch {
  sha: string;
  shortSha: string;
  date: string;
  author: string;
  subject: string;
  status: FileChange["status"];
  additions: number;
  deletions: number;
}

/** A file's history: which commits touched it, newest first. */
export function fileHistory(details: CommitDetail[], path: string): FileTouch[] {
  const touches: FileTouch[] = [];
  for (const detail of details) {
    const file = detail.files.find((f) => f.filename === path);
    if (!file) continue;
    touches.push({
      sha: detail.sha,
      shortSha: detail.shortSha,
      date: detail.date,
      author: detail.author.login ?? detail.author.name,
      subject: detail.subject,
      status: file.status,
      additions: file.additions,
      deletions: file.deletions,
    });
  }
  return touches.sort((a, b) => (a.date < b.date ? 1 : -1));
}

/** A file's patches, newest first. Commits whose diff GitHub withheld are skipped. */
export function fileDiffs(details: CommitDetail[], path: string): FileDiff[] {
  const diffs: FileDiff[] = [];
  for (const detail of details) {
    const file = detail.files.find((f) => f.filename === path);
    if (!file?.patch) continue;
    diffs.push({
      sha: detail.sha,
      shortSha: detail.shortSha,
      date: detail.date,
      author: detail.author.login ?? detail.author.name,
      subject: detail.subject,
      patch: file.patch,
    });
  }
  return diffs.sort((a, b) => (a.date < b.date ? 1 : -1));
}

/**
 * ponytail: co-change pairs are counted in a single pass over the same commit
 * details the hot-file ranking already fetched, so the graph costs no extra
 * requests. Bound it with `limit` (pairs) — the O(files²) per commit is fine at
 * this size and needs a different data source (a full clone) to go wider.
 */
export function fileGraph(details: CommitDetail[], opts: { nodes?: number; links?: number } = {}) {
  const nodeLimit = opts.nodes ?? 40;
  const linkLimit = opts.links ?? 60;

  const churn = new Map<string, { commits: number; churn: number }>();
  const pairs = new Map<string, number>();

  for (const detail of details) {
    const paths = [...new Set(detail.files.map((f) => f.filename))].sort();
    for (const file of detail.files) {
      const entry = churn.get(file.filename) ?? { commits: 0, churn: 0 };
      entry.churn += file.additions + file.deletions;
      churn.set(file.filename, entry);
    }
    for (const path of paths) {
      const entry = churn.get(path);
      if (entry) entry.commits += 1;
    }
    for (let i = 0; i < paths.length; i += 1) {
      for (let j = i + 1; j < paths.length; j += 1) {
        const key = `${paths[i]}\u0000${paths[j]}`;
        pairs.set(key, (pairs.get(key) ?? 0) + 1);
      }
    }
  }

  const nodes: FileNode[] = [...churn.entries()]
    .map(([path, entry]) => ({ path, group: topLevel(path), ...entry }))
    .sort((a, b) => b.churn - a.churn || a.path.localeCompare(b.path))
    .slice(0, nodeLimit);

  const kept = new Set(nodes.map((n) => n.path));
  const links: FileLink[] = [...pairs.entries()]
    .map(([key, weight]) => {
      const [source, target] = key.split("\u0000") as [string, string];
      return { source, target, weight };
    })
    .filter((edge) => kept.has(edge.source) && kept.has(edge.target))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, linkLimit);

  return { nodes, links };
}

function topLevel(path: string): string {
  const cut = path.indexOf("/");
  return cut === -1 ? "(root)" : path.slice(0, cut);
}

/** Case-insensitive filter over subject, message, author and sha. */
export function searchCommits(commits: Commit[], query: string): Commit[] {
  const q = query.trim().toLowerCase();
  if (!q) return commits;
  return commits.filter(
    (c) =>
      c.subject.toLowerCase().includes(q) ||
      c.message.toLowerCase().includes(q) ||
      c.author.name.toLowerCase().includes(q) ||
      (c.author.login ?? "").toLowerCase().includes(q) ||
      c.sha.startsWith(q),
  );
}

/** Merge contributor counts with the author rollup for display names/avatars. */
export function mergeContributors(
  rollup: AuthorRollup[],
  contributors: Contributor[],
): AuthorRollup[] {
  const byLogin = new Map(contributors.map((c) => [c.login, c]));
  return rollup.map((author) => {
    const match = author.login ? byLogin.get(author.login) : undefined;
    return match
      ? { ...author, avatar: match.avatar, commits: Math.max(author.commits, match.contributions) }
      : author;
  });
}

/** First line of a comment body, clipped — timelines show gists, not essays. */
function excerpt(body: string, max = 160): string {
  const line =
    body
      .split("\n")
      .find((l) => l.trim())
      ?.trim() ?? "";
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

/**
 * Flattens a pull request's commits, review verdicts and comments into one
 * newest-first history. Undated entries are dropped rather than sorted into a
 * bogus position.
 */
export function itemActivity(
  commits: Commit[],
  reviews: TrackedReview[],
  comments: TrackedComment[],
): TrackedActivity[] {
  const entries: TrackedActivity[] = [
    ...commits.map((c) => ({
      id: `commit:${c.sha}`,
      kind: "commit" as const,
      actor: { login: c.author.login ?? c.author.name, avatar: c.author.avatar ?? null },
      at: c.date,
      text: c.subject || c.shortSha,
      url: c.url,
    })),
    ...reviews.map((r) => ({
      id: `review:${r.id}`,
      kind: "review" as const,
      actor: r.author,
      at: r.submittedAt ?? "",
      text: r.state.toLowerCase().replace(/_/g, " "),
      url: r.url,
    })),
    ...comments.map((c) => ({
      id: `comment:${c.id}`,
      kind: "comment" as const,
      actor: c.author,
      at: c.createdAt,
      text: excerpt(c.body) || "(empty comment)",
      url: c.url,
    })),
  ];

  return entries.filter((e) => e.at).sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}
