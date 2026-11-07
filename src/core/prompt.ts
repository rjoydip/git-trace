import type { AuthorRollup } from "./trace";
import type { Commit, HotFile, RepoSummary, TraceStats } from "./types";

/** Each list is capped so the digest fits an agent's context window. */
export interface PromptLimits {
  hotFiles?: number;
  contributors?: number;
  commits?: number;
}

const DEFAULT_LIMITS: Required<PromptLimits> = { hotFiles: 10, contributors: 10, commits: 20 };

export interface PromptInput {
  meta: RepoSummary;
  stats: TraceStats;
  contributors: AuthorRollup[];
  hotFiles: HotFile[];
  commits: Commit[];
}

/**
 * Serializes a loaded trace into a compact digest an agent can consume. Shared
 * by the dashboard's copy button and `git-trace prompt`, so the two cannot
 * produce different text for the same repository.
 */
export function buildContextPrompt(input: PromptInput, limits: PromptLimits = {}): string {
  const { meta, stats, contributors, hotFiles, commits } = input;
  const caps = { ...DEFAULT_LIMITS, ...limits };
  const lines = [
    `[REPOSITORY CONTEXT — ${meta.fullName}]`,
    meta.description ?? "",
    `Branch: ${meta.defaultBranch} · Language: ${meta.language ?? "unknown"} · Stars: ${meta.stars}`,
    "",
    `STATS: ${stats.commits} commits · ${stats.authors} contributors · ${stats.filesTouched} files touched`,
    `       +${stats.additions} / -${stats.deletions} lines`,
    "",
    "HOT FILES (by churn):",
    ...hotFiles
      .slice(0, caps.hotFiles)
      .map((f) => `  ${f.path} — ${f.commits} commits, +${f.additions}/-${f.deletions}`),
    "",
    "TOP CONTRIBUTORS:",
    ...contributors
      .slice(0, caps.contributors)
      .map((c) => `  ${c.login ?? c.name} — ${c.commits} commits`),
    "",
    "RECENT COMMITS:",
    ...commits
      .slice(0, caps.commits)
      .map((c) => `  ${c.shortSha} ${c.date} ${c.author.login ?? c.author.name}: ${c.subject}`),
  ];
  return lines.join("\n");
}
