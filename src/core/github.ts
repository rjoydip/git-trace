import type {
  Commit,
  CommitDetail,
  Contributor,
  FileChange,
  ItemActor,
  ItemKind,
  ItemState,
  ItemSummary,
  RepoRef,
  RepoSummary,
  TrackedComment,
  TrackedItem,
  TrackedReview,
} from "./types";

export class GitHubError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "GitHubError";
  }
}

export interface GitHubClientOptions {
  token?: string;
  /** Override for tests. Defaults to the public GitHub API. */
  baseUrl?: string;
  /** Edge-cache TTL for successful GETs, in seconds. 0 disables caching. */
  cacheTtlSeconds?: number;
}

/**
 * Minimal view of the Workers Cache API (`caches.default`), which the DOM lib
 * does not declare. Absent outside the Workers runtime (e.g. in tests).
 */
interface EdgeCache {
  match(request: string): Promise<Response | undefined>;
  put(request: string, response: Response): Promise<void>;
}

/** The Workers edge cache, or undefined where it isn't available. */
function edgeCache(): EdgeCache | undefined {
  return (globalThis as { caches?: { default?: EdgeCache } }).caches?.default;
}

export const DEFAULT_CACHE_TTL_SECONDS = 300;

/** Parses "owner/name" or a github.com URL into a RepoRef, or throws. */
export function parseRepo(input: string): RepoRef {
  const trimmed = input.trim().replace(/\.git$/, "");
  const url = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+?)\/?$/.exec(trimmed);
  const short = /^([\w.-]+)\/([\w.-]+)$/.exec(trimmed);
  const match = url ?? short;
  if (!match?.[1] || !match[2]) {
    throw new GitHubError(
      400,
      `Not a repository: expected "owner/name" or a GitHub URL, got "${input}"`,
    );
  }
  return { owner: match[1], name: match[2] };
}

/** Short, non-reversible tag for a token. Cache-key discrimination only. */
async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest).slice(0, 8)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export interface ListCommitsOptions {
  path?: string;
  author?: string;
  since?: string;
  until?: string;
  perPage?: number;
  page?: number;
  sha?: string;
}

export interface ListItemsOptions {
  state?: ItemState;
  perPage?: number;
}

/** Thin fetch client over the GitHub REST API — the only network dependency. */
export class GitHubClient {
  private readonly baseUrl: string;
  private readonly cacheTtl: number;
  /** Memoised token hash; one digest per client instance (i.e. per request). */
  private keySuffix: Promise<string> | undefined;
  constructor(private readonly options: GitHubClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? "https://api.github.com";
    this.cacheTtl = options.cacheTtlSeconds ?? DEFAULT_CACHE_TTL_SECONDS;
  }

  /**
   * GET with an edge cache in front. Rate limits bite when the dashboard loads
   * (a few dozen requests), so successful responses are cached for `cacheTtl`
   * — reloads then cost zero GitHub requests. Errors are never cached, so a
   * rate-limited response cannot get stuck in the cache.
   */
  private async get<T>(path: string): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const cache = this.cacheTtl > 0 ? edgeCache() : undefined;
    const key = cache ? await this.cacheKey(url) : url;
    if (cache) {
      const hit = await cache.match(key).catch(() => undefined);
      if (hit) return (await hit.json()) as T;
    }

    const headers: Record<string, string> = {
      accept: "application/vnd.github+json",
      "user-agent": "git-trace",
      "x-github-api-version": "2022-11-28",
    };
    if (this.options.token) headers.authorization = `Bearer ${this.options.token}`;

    const res = await fetch(url, { headers });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      const message = body?.message ?? `GitHub API ${res.status}`;
      // Turn the opaque rate-limit failure into the action that fixes it.
      const hint =
        (res.status === 403 || res.status === 429) && /rate limit/i.test(message)
          ? " — add a personal access token in Settings to raise the limit from 60 to 5000 requests/hour."
          : "";
      throw new GitHubError(res.status, message + hint);
    }
    const data = (await res.json()) as T;

    if (cache) {
      const cached = new Response(JSON.stringify(data), {
        headers: {
          "content-type": "application/json",
          "cache-control": `public, max-age=${this.cacheTtl}`,
        },
      });
      await cache.put(key, cached).catch(() => undefined);
    }
    return data;
  }

  /**
   * Cache key for a GitHub URL. With a token in play the key carries a hash of
   * it, so a cached private-repo response can never be handed to a request made
   * with a different token — or with none at all.
   */
  private async cacheKey(url: string): Promise<string> {
    if (!this.options.token) return url;
    this.keySuffix ??= hashToken(this.options.token);
    const suffix = await this.keySuffix;
    return `${url}${url.includes("?") ? "&" : "?"}__token=${suffix}`;
  }

  getRepo(ref: RepoRef): Promise<RepoSummary> {
    return this.get<RawRepo>(`/repos/${ref.owner}/${ref.name}`).then(toSummary);
  }

  async listCommits(ref: RepoRef, opts: ListCommitsOptions = {}): Promise<Commit[]> {
    const params = new URLSearchParams({ per_page: String(clamp(opts.perPage ?? 30, 1, 100)) });
    if (opts.path) params.set("path", opts.path);
    if (opts.author) params.set("author", opts.author);
    if (opts.since) params.set("since", opts.since);
    if (opts.until) params.set("until", opts.until);
    if (opts.page) params.set("page", String(opts.page));
    if (opts.sha) params.set("sha", opts.sha);
    const raw = await this.get<RawCommit[]>(`/repos/${ref.owner}/${ref.name}/commits?${params}`);
    return raw.map(toCommit);
  }

  getCommit(ref: RepoRef, sha: string): Promise<CommitDetail> {
    return this.get<RawCommitDetail>(`/repos/${ref.owner}/${ref.name}/commits/${sha}`).then(
      (raw) => ({
        ...toCommit(raw),
        files: (raw.files ?? []).map(toFileChange),
        stats: raw.stats ?? { additions: 0, deletions: 0, total: 0 },
      }),
    );
  }

  async getContributors(ref: RepoRef, perPage = 100): Promise<Contributor[]> {
    const raw = await this.get<RawContributor[]>(
      `/repos/${ref.owner}/${ref.name}/contributors?per_page=${clamp(perPage, 1, 100)}`,
    );
    return raw.map((c) => ({
      login: c.login,
      name: c.login,
      avatar: c.avatar_url,
      contributions: c.contributions,
    }));
  }

  /* ------------------------------------------------------ pull requests / issues */

  async getPull(ref: RepoRef, number: number): Promise<TrackedItem> {
    const raw = await this.get<RawPull>(
      `/repos/${ref.owner}/${ref.name}/pulls/${clamp(number, 1, Number.MAX_SAFE_INTEGER)}`,
    );
    return toTrackedItem(raw, "pull", `${ref.owner}/${ref.name}`);
  }

  async getIssue(ref: RepoRef, number: number): Promise<TrackedItem> {
    const raw = await this.get<RawIssue>(
      `/repos/${ref.owner}/${ref.name}/issues/${clamp(number, 1, Number.MAX_SAFE_INTEGER)}`,
    );
    // GitHub serves pull requests from the issues collection too; send the
    // caller to the right endpoint rather than reporting half a PR.
    if (raw.pull_request) {
      throw new GitHubError(422, `#${number} is a pull request — switch the kind to "pull".`);
    }
    return toTrackedItem(raw, "issue", `${ref.owner}/${ref.name}`);
  }

  async getPullCommits(ref: RepoRef, number: number, perPage = 30): Promise<Commit[]> {
    const raw = await this.get<RawCommit[]>(
      `/repos/${ref.owner}/${ref.name}/pulls/${number}/commits?per_page=${clamp(perPage, 1, 100)}`,
    );
    return raw.map(toCommit);
  }

  async getPullReviews(ref: RepoRef, number: number, perPage = 30): Promise<TrackedReview[]> {
    const raw = await this.get<RawReview[]>(
      `/repos/${ref.owner}/${ref.name}/pulls/${number}/reviews?per_page=${clamp(perPage, 1, 100)}`,
    );
    return raw
      .filter((r) => r.state !== "PENDING")
      .map((r) => ({
        id: String(r.id),
        author: actor(r.user),
        state: r.state,
        submittedAt: r.submitted_at,
        url: r.html_url,
      }));
  }

  async getItemComments(ref: RepoRef, number: number, perPage = 30): Promise<TrackedComment[]> {
    const raw = await this.get<RawIssueComment[]>(
      `/repos/${ref.owner}/${ref.name}/issues/${number}/comments?per_page=${clamp(perPage, 1, 100)}`,
    );
    return raw.map((c) => ({
      id: String(c.id),
      author: actor(c.user),
      body: c.body ?? "",
      createdAt: c.created_at,
      url: c.html_url,
    }));
  }

  /**
   * The repository's pull requests *and* issues in one request: GitHub serves
   * pull requests from the issues collection, tagged with `pull_request`. The
   * caller filters by kind, so one fetch covers both.
   */
  async listItems(ref: RepoRef, opts: ListItemsOptions = {}): Promise<ItemSummary[]> {
    const params = new URLSearchParams({
      state: opts.state ?? "open",
      per_page: String(clamp(opts.perPage ?? 50, 1, 100)),
      sort: "updated",
      direction: "desc",
    });
    const raw = await this.get<RawIssue[]>(`/repos/${ref.owner}/${ref.name}/issues?${params}`);
    return raw.map(toItemSummary);
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.floor(n)));
}

interface RawCommit {
  sha: string;
  html_url: string;
  parents?: Array<{ sha: string }>;
  commit: {
    message: string;
    author: { name: string; email: string; date: string } | null;
  };
  author: { login: string; avatar_url: string } | null;
}

interface RawCommitDetail extends RawCommit {
  files?: RawFile[];
  stats?: { additions: number; deletions: number; total: number };
}

interface RawFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
}

interface RawContributor {
  login: string;
  avatar_url: string;
  contributions: number;
}

interface RawRepo {
  full_name: string;
  description: string | null;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  default_branch: string;
  language: string | null;
  html_url: string;
}

function toCommit(raw: RawCommit): Commit {
  const message = raw.commit.message;
  const subject = message.split("\n", 1)[0] ?? "";
  return {
    sha: raw.sha,
    shortSha: raw.sha.slice(0, 7),
    message,
    subject,
    author: {
      name: raw.commit.author?.name ?? "unknown",
      email: raw.commit.author?.email ?? "",
      ...(raw.author ? { login: raw.author.login, avatar: raw.author.avatar_url } : {}),
    },
    date: raw.commit.author?.date ?? "",
    url: raw.html_url,
    parents: (raw.parents ?? []).map((p) => p.sha),
  };
}

function toFileChange(raw: RawFile): FileChange {
  const status =
    raw.status === "added" || raw.status === "removed" || raw.status === "renamed"
      ? raw.status
      : "modified";
  return {
    filename: raw.filename,
    status,
    additions: raw.additions,
    deletions: raw.deletions,
    ...(raw.patch ? { patch: raw.patch } : {}),
  };
}

function toSummary(raw: RawRepo): RepoSummary {
  return {
    fullName: raw.full_name,
    description: raw.description,
    stars: raw.stargazers_count,
    forks: raw.forks_count,
    openIssues: raw.open_issues_count,
    defaultBranch: raw.default_branch,
    language: raw.language,
    url: raw.html_url,
  };
}

/* -------------------------------------------------- pull requests and issues */

type RawActor = { login: string; avatar_url: string } | null;

interface RawLabel {
  name: string;
  color: string;
}

interface RawPull {
  number: number;
  title: string;
  body: string | null;
  state: string;
  draft?: boolean;
  merged?: boolean;
  merged_at?: string | null;
  user: RawActor;
  labels?: RawLabel[];
  comments?: number;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  html_url: string;
  additions?: number;
  deletions?: number;
  changed_files?: number;
  commits?: number;
  base?: { ref: string };
  head?: { ref: string };
}

interface RawIssue {
  number: number;
  title: string;
  body: string | null;
  state: string;
  draft?: boolean;
  user: RawActor;
  labels?: RawLabel[];
  comments?: number;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  html_url: string;
  pull_request?: { url: string; merged_at?: string | null };
}

interface RawIssueComment {
  id: number;
  user: RawActor;
  body: string | null;
  created_at: string;
  html_url: string;
}

interface RawReview {
  id: number;
  user: RawActor;
  state: string;
  submitted_at: string | null;
  html_url: string;
}

function actor(user: RawActor): ItemActor {
  return { login: user?.login ?? "ghost", avatar: user?.avatar_url ?? null };
}

/**
 * The list view of a timeline item. GitHub tags pull requests inside the issues
 * collection with `pull_request`, which is the only thing that tells the two
 * apart there; merged state comes along as `pull_request.merged_at`.
 */
function toItemSummary(raw: RawIssue): ItemSummary {
  const isPull = Boolean(raw.pull_request);
  return {
    kind: isPull ? "pull" : "issue",
    number: raw.number,
    title: raw.title,
    state: raw.state === "open" ? "open" : "closed",
    draft: Boolean(raw.draft),
    merged: Boolean(raw.pull_request?.merged_at),
    author: actor(raw.user),
    labels: (raw.labels ?? []).map((l) => ({ name: l.name, color: l.color })),
    comments: raw.comments ?? 0,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    url: raw.html_url,
  };
}

/** Fills the fields both endpoints share; PR-only numbers stay 0 for issues. */
function toTrackedItem(
  raw: RawIssue & Partial<RawPull>,
  kind: ItemKind,
  repo: string,
): TrackedItem {
  return {
    kind,
    repo,
    number: raw.number,
    title: raw.title,
    body: raw.body ?? "",
    state: raw.state === "open" ? "open" : "closed",
    draft: Boolean(raw.draft),
    merged: Boolean(raw.merged),
    author: actor(raw.user),
    labels: (raw.labels ?? []).map((l) => ({ name: l.name, color: l.color })),
    comments: raw.comments ?? 0,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    closedAt: raw.closed_at ?? null,
    mergedAt: raw.merged_at ?? null,
    url: raw.html_url,
    base: raw.base?.ref ?? null,
    head: raw.head?.ref ?? null,
    additions: raw.additions ?? 0,
    deletions: raw.deletions ?? 0,
    changedFiles: raw.changed_files ?? 0,
    commitCount: raw.commits ?? 0,
    activity: [],
  };
}
