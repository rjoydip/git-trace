import {
  GitHubClient,
  parseRepo,
  type GitHubClientOptions,
  type ListCommitsOptions,
} from "./github";
import {
  activityTimeline,
  fileDiffs,
  fileGraph,
  fileHistory,
  hotFiles,
  itemActivity,
  mergeContributors,
  rollupAuthors,
  searchCommits,
  summarize,
  type AuthorRollup,
} from "./trace";
import type {
  ActivityBucket,
  Commit,
  Contributor,
  FileDiff,
  FileGraph,
  HotFile,
  ItemKind,
  ItemState,
  ItemSummary,
  RepoRef,
  RepoSummary,
  TrackedComment,
  TrackedItem,
  TrackedReview,
  TraceStats,
} from "./types";

/**
 * ponytail: hot-file and file-history need per-commit file lists, which cost
 * one GitHub request each. Bound the fan-out and let the edge cache absorb
 * reloads; raise this (or add a KV cache for cross-PoP sharing) when the
 * dashboard needs more history than the latest N commits.
 */
export const DETAIL_COMMIT_LIMIT = 30;

export interface TraceServiceOptions {
  token?: string;
  baseUrl?: string;
  cacheTtlSeconds?: number;
}

/** Everything the dashboard renders, produced from a single detail pass. */
export interface TracePayload {
  repo: string;
  meta: RepoSummary;
  stats: TraceStats;
  commits: Commit[];
  contributors: AuthorRollup[];
  hotFiles: HotFile[];
  activity: ActivityBucket[];
  /** Co-change graph over the same detail pass; no extra requests. */
  fileGraph: FileGraph;
}

/** The single source of truth both the dashboard API and the MCP server call. */
export class TraceService {
  private readonly client: GitHubClient;
  constructor(options: TraceServiceOptions = {}) {
    const clientOptions: GitHubClientOptions = {};
    if (options.token !== undefined) clientOptions.token = options.token;
    if (options.baseUrl !== undefined) clientOptions.baseUrl = options.baseUrl;
    if (options.cacheTtlSeconds !== undefined)
      clientOptions.cacheTtlSeconds = options.cacheTtlSeconds;
    this.client = new GitHubClient(clientOptions);
  }

  resolveRepo(input: string): RepoRef {
    return parseRepo(input);
  }

  repo(input: string): Promise<RepoSummary> {
    return this.client.getRepo(this.resolveRepo(input));
  }

  /**
   * Load the whole dashboard in one pass. Commit details (the expensive part)
   * are fetched once and shared by stats and hot files, instead of twice.
   */
  async trace(
    input: string,
    opts: { commitLimit?: number; detailLimit?: number; hotFileLimit?: number } = {},
  ): Promise<TracePayload> {
    const ref = this.resolveRepo(input);
    const [meta, commits, contributors] = await Promise.all([
      this.client.getRepo(ref),
      this.client.listCommits(ref, { perPage: clamp(opts.commitLimit ?? 100, 1, 100) }),
      this.client.getContributors(ref).catch((): Contributor[] => []),
    ]);

    const detailCount = clamp(opts.detailLimit ?? DETAIL_COMMIT_LIMIT, 1, 100);
    const details = await Promise.all(
      commits.slice(0, detailCount).map((c) => this.client.getCommit(ref, c.sha)),
    );

    const touched = new Set<string>();
    let additions = 0;
    let deletions = 0;
    for (const d of details) {
      additions += d.stats.additions;
      deletions += d.stats.deletions;
      for (const f of d.files) touched.add(f.filename);
    }

    return {
      repo: `${ref.owner}/${ref.name}`,
      meta,
      stats: { ...summarize(commits), filesTouched: touched.size, additions, deletions },
      commits: commits.slice(0, 50),
      contributors: mergeContributors(rollupAuthors(commits), contributors),
      hotFiles: hotFiles(details, clamp(opts.hotFileLimit ?? 12, 1, 100)),
      activity: activityTimeline(commits),
      fileGraph: fileGraph(details),
    };
  }

  async stats(input: string, opts: { limit?: number } = {}): Promise<TraceStats> {
    const commits = await this.client.listCommits(this.resolveRepo(input), {
      perPage: clamp(opts.limit ?? 100, 1, 100),
    });
    const stats = summarize(commits);
    const details = await this.details(input, Math.min(commits.length, DETAIL_COMMIT_LIMIT));
    const touched = new Set<string>();
    let additions = 0;
    let deletions = 0;
    for (const d of details) {
      additions += d.stats.additions;
      deletions += d.stats.deletions;
      for (const f of d.files) touched.add(f.filename);
    }
    return { ...stats, filesTouched: touched.size, additions, deletions };
  }

  async commits(input: string, opts: ListCommitsOptions & { q?: string } = {}): Promise<Commit[]> {
    const commits = await this.client.listCommits(this.resolveRepo(input), opts);
    return opts.q ? searchCommits(commits, opts.q) : commits;
  }

  async contributors(input: string): Promise<AuthorRollup[]> {
    const ref = this.resolveRepo(input);
    const [commits, contributors] = await Promise.all([
      this.client.listCommits(ref, { perPage: 100 }),
      this.client.getContributors(ref).catch((): Contributor[] => []),
    ]);
    return mergeContributors(rollupAuthors(commits), contributors);
  }

  async activity(
    input: string,
    opts: { limit?: number; since?: string; until?: string } = {},
  ): Promise<ActivityBucket[]> {
    const commits = await this.client.listCommits(this.resolveRepo(input), {
      perPage: clamp(opts.limit ?? 100, 1, 100),
    });
    return activityTimeline(commits, opts.since, opts.until);
  }

  async hotFiles(input: string, opts: { limit?: number } = {}): Promise<HotFile[]> {
    const details = await this.details(input, DETAIL_COMMIT_LIMIT);
    return hotFiles(details, clamp(opts.limit ?? 20, 1, 100));
  }

  async fileHistory(input: string, path: string, opts: { limit?: number } = {}) {
    if (!path.trim()) throw new Error("path is required");
    const details = await this.details(input, DETAIL_COMMIT_LIMIT);
    return fileHistory(details, path).slice(0, clamp(opts.limit ?? 50, 1, 200));
  }

  /** The patches for one file, newest first — fetched on demand, not with the trace. */
  async fileDiffs(input: string, path: string, opts: { limit?: number } = {}): Promise<FileDiff[]> {
    if (!path.trim()) throw new Error("path is required");
    const details = await this.details(input, DETAIL_COMMIT_LIMIT);
    return fileDiffs(details, path).slice(0, clamp(opts.limit ?? 10, 1, 100));
  }

  /**
   * Trace one pull request or issue: its own timeline (commits, review
   * verdicts, comments) plus the headline numbers. A missing discussion is not
   * a failure — an item with no comments should still render.
   */
  async track(
    input: string,
    opts: { number: number; kind: ItemKind; limit?: number },
  ): Promise<TrackedItem> {
    const ref = this.resolveRepo(input);
    const limit = clamp(opts.limit ?? 20, 1, 100);

    if (opts.kind === "issue") {
      const [item, comments] = await Promise.all([
        this.client.getIssue(ref, opts.number),
        this.client.getItemComments(ref, opts.number, limit).catch((): TrackedComment[] => []),
      ]);
      return { ...item, activity: itemActivity([], [], comments) };
    }

    const [item, commits, reviews, comments] = await Promise.all([
      this.client.getPull(ref, opts.number),
      this.client.getPullCommits(ref, opts.number, limit).catch((): Commit[] => []),
      this.client.getPullReviews(ref, opts.number, limit).catch((): TrackedReview[] => []),
      this.client.getItemComments(ref, opts.number, limit).catch((): TrackedComment[] => []),
    ]);
    return { ...item, activity: itemActivity(commits, reviews, comments) };
  }

  /**
   * The repository's pull requests and issues, newest activity first. One
   * GitHub request covers both kinds; the caller filters.
   */
  async items(
    input: string,
    opts: { state?: ItemState; limit?: number } = {},
  ): Promise<ItemSummary[]> {
    return this.client.listItems(this.resolveRepo(input), {
      state: opts.state ?? "open",
      perPage: clamp(opts.limit ?? 50, 1, 100),
    });
  }

  private async details(input: string, limit: number) {
    const ref = this.resolveRepo(input);
    const commits = await this.client.listCommits(ref, { perPage: clamp(limit, 1, 100) });
    return Promise.all(commits.map((c) => this.client.getCommit(ref, c.sha)));
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.floor(n)));
}
