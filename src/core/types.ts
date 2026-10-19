/** A repository coordinate, "owner/name". */
export interface RepoRef {
  owner: string;
  name: string;
}

interface GitAuthor {
  name: string;
  email: string;
  login?: string;
  avatar?: string;
}

export interface Commit {
  sha: string;
  shortSha: string;
  message: string;
  subject: string;
  author: GitAuthor;
  date: string;
  url: string;
  parents: string[];
}

type FileStatus = "added" | "modified" | "removed" | "renamed";

export interface FileChange {
  filename: string;
  status: FileStatus;
  additions: number;
  deletions: number;
  /** Unified diff hunk, when GitHub includes one (large or binary files have none). */
  patch?: string;
}

export interface CommitDetail extends Commit {
  files: FileChange[];
  stats: { additions: number; deletions: number; total: number };
}

export interface Contributor {
  login: string;
  name: string;
  avatar: string;
  contributions: number;
}

export interface RepoSummary {
  fullName: string;
  description: string | null;
  stars: number;
  forks: number;
  openIssues: number;
  defaultBranch: string;
  language: string | null;
  url: string;
}

export interface ActivityBucket {
  date: string;
  count: number;
}

export interface HotFile {
  path: string;
  commits: number;
  additions: number;
  deletions: number;
  churn: number;
}

/** One file in the co-change graph, sized by churn. */
export interface FileNode {
  path: string;
  /** Top-level directory, i.e. the cluster this file belongs to. */
  group: string;
  commits: number;
  churn: number;
}

/** Two files that were changed by the same commit, `weight` times. */
export interface FileLink {
  source: string;
  target: string;
  weight: number;
}

export interface FileGraph {
  nodes: FileNode[];
  links: FileLink[];
}

/** One commit's patch for a single file. */
export interface FileDiff {
  sha: string;
  shortSha: string;
  date: string;
  author: string;
  subject: string;
  patch: string;
}

export interface TraceStats {
  commits: number;
  authors: number;
  filesTouched: number;
  additions: number;
  deletions: number;
  firstCommit: string | null;
  lastCommit: string | null;
}

/** A tracked pull request or issue — the unit GitHub calls a "timeline item". */
export type ItemKind = "pull" | "issue";

export interface ItemActor {
  login: string;
  avatar: string | null;
}

interface ItemLabel {
  name: string;
  color: string;
}

export interface TrackedComment {
  id: string;
  author: ItemActor;
  body: string;
  createdAt: string;
  url: string;
}

export interface TrackedReview {
  id: string;
  author: ItemActor;
  /** APPROVED | CHANGES_REQUESTED | COMMENTED | DISMISSED */
  state: string;
  submittedAt: string | null;
  url: string;
}

type ActivityKind = "commit" | "comment" | "review";

/** One entry in a pull request's or issue's history, flattened for display. */
export interface TrackedActivity {
  id: string;
  kind: ActivityKind;
  actor: ItemActor;
  at: string;
  text: string;
  url: string | null;
}

/** A pull request or issue as it appears in a list — no body, no timeline. */
export interface ItemSummary {
  kind: ItemKind;
  number: number;
  title: string;
  state: "open" | "closed";
  draft: boolean;
  merged: boolean;
  author: ItemActor;
  labels: ItemLabel[];
  comments: number;
  createdAt: string;
  updatedAt: string;
  url: string;
}

/** Which slice of a repository's pull requests and issues to list. */
export type ItemState = "open" | "closed" | "all";

export interface TrackedItem {
  kind: ItemKind;
  repo: string;
  number: number;
  title: string;
  body: string;
  state: "open" | "closed";
  draft: boolean;
  merged: boolean;
  author: ItemActor;
  labels: ItemLabel[];
  comments: number;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  mergedAt: string | null;
  url: string;
  /** Pull requests only; null / 0 for issues. */
  base: string | null;
  head: string | null;
  additions: number;
  deletions: number;
  changedFiles: number;
  commitCount: number;
  /** Commits, review verdicts and comments, newest first. */
  activity: TrackedActivity[];
}

/** One entry in a repository's recursive file listing. */
export interface TreeEntry {
  path: string;
  type: "blob" | "tree";
  size: number;
  sha: string;
}

/** A repository's whole file listing at one ref. */
export interface RepoTree {
  repo: string;
  /** The ref the listing was taken at — the default branch, unless overridden. */
  ref: string;
  entries: TreeEntry[];
  /** GitHub caps the recursive listing; a truncated tree is still usable. */
  truncated: boolean;
}

/** Branch and tag names, for the file browser's ref picker. */
export interface RepoRefs {
  defaultBranch: string;
  branches: string[];
  tags: string[];
}

/** A tag, enriched with its release notes when one is published. */
export interface TagDetail {
  repo: string;
  tag: string;
  /** `release` when GitHub has published notes for this tag, else the commit it points at. */
  kind: "release" | "commit";
  /** The release title, or the commit's first line for a bare tag. */
  title: string;
  body: string | null;
  author: string | null;
  publishedAt: string | null;
  url: string;
  prerelease: boolean;
  sha: string | null;
}

/** One file's text, or the reason GitHub would not inline it. */
export interface FileContent {
  repo: string;
  path: string;
  sha: string;
  size: number;
  /** null when the file is binary, or larger than GitHub inlines (1 MB). */
  text: string | null;
  /** The file on GitHub, for reading something too big to render here. */
  url: string;
}
