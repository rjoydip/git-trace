import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertCircle,
  BookOpen,
  Check,
  Copy,
  Cpu,
  Database,
  ExternalLink,
  Eye,
  Flame,
  GitBranch,
  GitCommit,
  GitCompare,
  Layers,
  List,
  Loader2,
  RefreshCw,
  Search,
  Share2,
  Sparkles,
  Star,
  Terminal,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DiffDialog } from "@/components/diff";
import { ExportMenu } from "@/components/export-menu";
import { FileGraphView } from "@/components/file-graph";
import { MarkdownBody } from "@/components/markdown";
import { cn } from "@/lib/utils";
import { classifyPath } from "@/lib/paths";
import { authorTallies, commitBody, filterCommits, type CommitOrder } from "@/lib/commits";
import { copyText } from "@/lib/export";
import { loadCommits, loadFileHistory, type DeploymentConfig } from "@/api";
import { setToken, useToken } from "@/lib/token";
import { CACHE_TTLS, setPrefs, usePrefs, WINDOWS } from "@/lib/prefs";
import type { AuthorRollup, FileTouch } from "../../core/trace";
import type {
  ActivityBucket,
  Commit,
  FileGraph,
  HotFile,
  RepoSummary,
  TraceStats,
} from "../../core/types";

const nf = new Intl.NumberFormat();
const df = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
const day = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
const clock = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });

export const MCP_TOOLS = [
  ["trace_repository", "Repository metadata plus commit, author and churn headline stats."],
  ["trace_commits", "List and search commits, optionally for a path or author."],
  ["trace_contributors", "Rank contributors by commit count, with avatars and last-commit date."],
  ["trace_hot_files", "Rank files by churn (additions + deletions) across the recent commits."],
  ["trace_file_history", "Trace one file's history: which commits touched it, with diff stats."],
  ["trace_activity", "Commit activity per calendar day over a window — the repository's pulse."],
  [
    "trace_pull_request",
    "One pull request: state, size, labels, review verdicts, commits, discussion.",
  ],
  ["trace_issue", "One issue: state, labels, author, body and its comment thread."],
] as const;

const KIND_FILTERS = ["all", "code", "docs", "config", "other"] as const;
type KindFilter = (typeof KIND_FILTERS)[number];

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : df.format(d);
}

/** Small uppercase label used at the top of the left-hand control panels. */
function PanelLabel({ icon: Icon, children }: { icon: typeof Users; children: React.ReactNode }) {
  return (
    <h3 className="flex items-center gap-2 text-xs font-semibold tracking-wider text-zinc-200 uppercase">
      <Icon className="size-3.5 text-indigo-400" />
      {children}
    </h3>
  );
}

/* ------------------------------------------------------------------ metrics */

function MetricCard({
  title,
  value,
  trend,
  icon: Icon,
  tone,
}: {
  title: string;
  value: string;
  trend: string;
  icon: typeof Users;
  tone: string;
}) {
  return (
    <div className="glass-panel-interactive space-y-2 rounded-2xl p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-400">{title}</span>
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-2">
          <Icon className={cn("size-4", tone)} />
        </div>
      </div>
      <div>
        <h4 className="font-mono text-2xl font-bold tracking-tight text-zinc-100">{value}</h4>
        <p className="mt-1 text-[11px] text-zinc-400">{trend}</p>
      </div>
    </div>
  );
}

export function MetricRow({ stats, meta }: { stats: TraceStats; meta: RepoSummary }) {
  return (
    <div className="stagger grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <MetricCard
        title="Commits Traced"
        value={nf.format(stats.commits)}
        trend={`Since ${stats.firstCommit ? day.format(new Date(stats.firstCommit)) : "—"}`}
        icon={GitCommit}
        tone="text-cyan-400"
      />
      <MetricCard
        title="Contributors"
        value={nf.format(stats.authors)}
        trend="Ranked by commit count"
        icon={Users}
        tone="text-indigo-400"
      />
      <MetricCard
        title="Files Touched"
        value={nf.format(stats.filesTouched)}
        trend="Across the traced window"
        icon={GitBranch}
        tone="text-purple-400"
      />
      <MetricCard
        title="Churn"
        value={`+${nf.format(stats.additions)}`}
        trend={`−${nf.format(stats.deletions)} lines · ${meta.language ?? "unknown"}`}
        icon={Activity}
        tone="text-emerald-400"
      />
    </div>
  );
}

/* ------------------------------------------------------------ left controls */

export function RepoTargetPanel({
  value,
  onChange,
  onSubmit,
  onRefresh,
  busy,
  recent = [],
}: {
  value: string;
  onChange: (next: string) => void;
  onSubmit: () => void;
  onRefresh: () => void;
  busy: boolean;
  recent?: string[];
}) {
  const options = recent;

  return (
    <Card className="border-indigo-500/20">
      <div className="flex items-center justify-between">
        <PanelLabel icon={Search}>Repository Target</PanelLabel>
        <span className="flex items-center gap-1.5 font-mono text-[10px] text-zinc-500">
          <span className="relative flex size-1.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75 motion-reduce:animate-none" />
            <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
          </span>
          Live API
        </span>
      </div>

      <div className="space-y-3 font-mono text-xs">
        {options.length > 0 && (
          <div>
            <label className="mb-1 block text-[11px] text-zinc-400" htmlFor="recent-repos">
              Recently traced
            </label>
            <Select
              value={options.includes(value) ? value : (options[0] ?? "")}
              onValueChange={onChange}
            >
              <SelectTrigger id="recent-repos" className="font-mono">
                <SelectValue placeholder="no history yet" />
              </SelectTrigger>
              <SelectContent>
                {options.map((r) => (
                  <SelectItem key={r} value={r} className="font-mono">
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div>
          <label className="mb-1 block text-[11px] text-zinc-400" htmlFor="repo-input">
            Custom repository
          </label>
          <Input
            id="repo-input"
            placeholder="owner/name or GitHub URL"
            value={value}
            spellCheck={false}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSubmit();
            }}
            className="font-mono"
          />
        </div>

        <Button
          variant="default"
          className="mt-2 w-full"
          onClick={onSubmit}
          disabled={busy || !value.trim()}
        >
          {busy ? <Loader2 className="animate-spin" /> : <RefreshCw />} Re-fetch
        </Button>

        <Button variant="outline" size="xs" className="w-full" onClick={onRefresh} disabled={busy}>
          Rebuild from cache
        </Button>
      </div>
    </Card>
  );
}

export function RepoSummaryCard({ meta, stats }: { meta: RepoSummary; stats: TraceStats }) {
  return (
    <Card className="border-emerald-500/20">
      <div className="flex items-center justify-between">
        <Badge variant="success" className="rounded-full">
          {meta.defaultBranch}
        </Badge>
        <a
          href={meta.url}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 font-mono text-xs text-zinc-500 transition-colors hover:text-cyan-400"
        >
          {meta.fullName}
          <ExternalLink className="size-3" />
        </a>
      </div>

      <h4 className="text-sm leading-snug font-semibold text-zinc-100">
        {meta.description ?? "No description provided."}
      </h4>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-zinc-800/80 pt-2 text-xs text-zinc-400">
        <span className="flex items-center gap-1">
          <Star className="size-3.5 text-amber-400" />
          {nf.format(meta.stars)}
        </span>
        <span className="flex items-center gap-1">
          <GitBranch className="size-3.5 text-indigo-400" />
          {nf.format(meta.forks)}
        </span>
        <span className="flex items-center gap-1">
          <AlertCircle className="size-3.5 text-rose-400" />
          {nf.format(meta.openIssues)}
        </span>
        <span className="text-zinc-600">•</span>
        <span className="font-mono text-emerald-400">+{nf.format(stats.additions)}</span>
        <span className="font-mono text-rose-400">−{nf.format(stats.deletions)}</span>
      </div>
    </Card>
  );
}

/** Serializes the loaded trace into a compact digest an agent can consume. */
function buildContextPrompt(input: {
  meta: RepoSummary;
  stats: TraceStats;
  contributors: AuthorRollup[];
  hotFiles: HotFile[];
  commits: Commit[];
}): string {
  const { meta, stats, contributors, hotFiles, commits } = input;
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
      .slice(0, 10)
      .map((f) => `  ${f.path} — ${f.commits} commits, +${f.additions}/-${f.deletions}`),
    "",
    "TOP CONTRIBUTORS:",
    ...contributors.slice(0, 10).map((c) => `  ${c.login ?? c.name} — ${c.commits} commits`),
    "",
    "RECENT COMMITS:",
    ...commits
      .slice(0, 20)
      .map((c) => `  ${c.shortSha} ${c.date} ${c.author.login ?? c.author.name}: ${c.subject}`),
  ];
  return lines.join("\n");
}

export function PromptExportCard({
  payload,
}: {
  payload: Parameters<typeof buildContextPrompt>[0];
}) {
  const [copied, setCopied] = useState(false);

  return (
    <Card className="bg-gradient-to-br from-indigo-950/20 via-zinc-900/60 to-zinc-950">
      <h4 className="flex items-center gap-2 text-xs font-semibold text-zinc-200">
        <Sparkles className="size-4 text-indigo-400" /> Zero-Token Prompt Generator
      </h4>
      <p className="text-xs leading-relaxed text-zinc-400">
        Export a formatted digest of this repository's history, optimised for an agent's context
        window.
      </p>
      <Button
        variant={copied ? "success" : "secondary"}
        className="mt-auto w-full py-2.5"
        onClick={() => {
          void copyText(buildContextPrompt(payload)).then((ok) => {
            if (!ok) return;
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2000);
          });
        }}
      >
        {copied ? <Check /> : <Copy className="text-indigo-400" />}
        {copied ? "Context Prompt Copied!" : "Copy LLM Context Prompt"}
      </Button>
    </Card>
  );
}

/* -------------------------------------------------------------- the timeline */

function ActivityStrip({ buckets, total }: { buckets: ActivityBucket[]; total: number }) {
  const max = useMemo(() => Math.max(1, ...buckets.map((b) => b.count)), [buckets]);

  if (buckets.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-zinc-400">
          {nf.format(total)} commits over {buckets.length} days
        </span>
        <span className="font-mono text-[10px] text-zinc-500">peak {max}/day</span>
      </div>
      <div className="flex h-16 items-end gap-[3px]">
        {buckets.map((b) => (
          <div
            key={b.date}
            className="flex-1 rounded-sm bg-indigo-500/35 transition-colors hover:bg-cyan-400"
            style={{ height: `${Math.max(4, (b.count / max) * 100)}%` }}
            title={`${day.format(new Date(`${b.date}T00:00:00Z`))} — ${b.count} commit${b.count === 1 ? "" : "s"}`}
          />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ commit timeline */

export function CommitTimeline({
  commits,
  activity,
}: {
  commits: Commit[];
  activity: ActivityBucket[];
}) {
  const { windowDays } = usePrefs();
  const [query, setQuery] = useState("");
  const [author, setAuthor] = useState("all");
  const [order, setOrder] = useState<CommitOrder>("newest");
  const [limit, setLimit] = useState("12");

  // The window is a view over what was already fetched — narrowing it costs no
  // GitHub requests. Bars are capped so a long window stays readable.
  const { windowed, buckets, total } = useMemo(() => {
    const cutoff = windowDays > 0 ? Date.now() - windowDays * 86_400_000 : 0;
    const inWindow = (iso: string) => {
      const at = new Date(iso).getTime();
      return cutoff === 0 || (Number.isFinite(at) && at >= cutoff);
    };
    const bars = activity.filter((b) => inWindow(`${b.date}T00:00:00Z`)).slice(-90);
    return {
      windowed: commits.filter((c) => inWindow(c.date)),
      buckets: bars,
      total: bars.reduce((sum, b) => sum + b.count, 0),
    };
  }, [commits, activity, windowDays]);

  // Search, author and order are also client-side, so they are instant.
  const authors = useMemo(() => authorTallies(windowed), [windowed]);

  const matched = useMemo(
    () => filterCommits(windowed, { author, query, order }),
    [windowed, author, query, order],
  );

  const visible = limit === "all" ? matched : matched.slice(0, Number(limit));

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 pb-4">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
            <Layers className="size-4 text-indigo-400" /> Chronological
          </h3>
          <p className="mt-0.5 text-xs text-zinc-400">
            Author, timestamp and message for the most recent commits
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={String(windowDays)}
            onValueChange={(next) => setPrefs({ windowDays: Number(next) })}
          >
            <SelectTrigger className="w-36" aria-label="Commit window">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WINDOWS.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1 font-mono text-xs text-zinc-400">
            {visible.length === windowed.length
              ? `${windowed.length} Graph Nodes`
              : `${visible.length} of ${windowed.length} Graph Nodes`}
          </span>
        </div>
      </div>

      <div className="grid gap-3 py-4 sm:grid-cols-2 lg:grid-cols-[1fr_10rem_9rem_8rem]">
        <Input
          placeholder="Filter by subject, body, SHA or author"
          value={query}
          spellCheck={false}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Filter commits"
        />
        <Select value={author} onValueChange={setAuthor}>
          <SelectTrigger aria-label="Filter by author">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All authors ({windowed.length})</SelectItem>
            {authors.map((a) => (
              <SelectItem key={a.name} value={a.name}>
                {a.name} ({a.count})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={order} onValueChange={(next) => setOrder(next as CommitOrder)}>
          <SelectTrigger aria-label="Commit order">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest first</SelectItem>
            <SelectItem value="oldest">Oldest first</SelectItem>
          </SelectContent>
        </Select>
        <Select value={limit} onValueChange={setLimit}>
          <SelectTrigger aria-label="Commits shown">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {["12", "25", "50", "all"].map((option) => (
              <SelectItem key={option} value={option}>
                {option === "all" ? "Show all" : `Show ${option}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <ActivityStrip buckets={buckets} total={total} />

      {visible.length === 0 ? (
        <p className="py-8 text-center text-xs text-zinc-500">
          {windowed.length === 0 ? "No commits in this window." : "No commits match these filters."}
        </p>
      ) : (
        <div className="space-y-6">
          {visible.map((c) => {
            const body = commitBody(c);
            return (
              <div
                key={c.sha}
                className="group relative border-l-2 border-zinc-800 pl-6 transition-colors hover:border-indigo-500/60"
              >
                <div className="absolute top-0 -left-[9px] flex size-4 items-center justify-center rounded-full border-2 border-indigo-500 bg-zinc-950 transition-transform group-hover:scale-110">
                  <div className="size-1.5 rounded-full bg-indigo-400" />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      {c.author.avatar ? (
                        <img
                          src={c.author.avatar}
                          alt=""
                          width={20}
                          height={20}
                          className="size-5 shrink-0 rounded-full ring-1 ring-zinc-700"
                        />
                      ) : (
                        <span className="grid size-5 shrink-0 place-items-center rounded-full bg-zinc-800 font-mono text-[9px] text-zinc-300">
                          {(c.author.login ?? c.author.name).slice(0, 1).toUpperCase()}
                        </span>
                      )}
                      <span className="truncate text-xs font-semibold text-zinc-200">
                        @{c.author.login ?? c.author.name}
                      </span>
                      <Badge variant="info">{c.shortSha}</Badge>
                    </div>
                    <span className="shrink-0 font-mono text-[11px] text-zinc-500">
                      {clock.format(new Date(c.date))}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <a
                      href={c.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-medium text-zinc-200 transition-colors hover:text-cyan-400"
                    >
                      {c.subject}
                    </a>
                    <p className="font-mono text-[10px] text-zinc-500">{formatDate(c.date)}</p>
                  </div>

                  {body && <MarkdownBody text={body} />}
                </div>
              </div>
            );
          })}

          {visible.length < matched.length && (
            <button
              type="button"
              onClick={() => setLimit("all")}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-900/60 py-2 font-mono text-xs text-zinc-400 transition-colors hover:text-zinc-100"
            >
              Show the remaining {matched.length - visible.length} of {matched.length} matches
            </button>
          )}
        </div>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------- contributors */

function authorKey(c: AuthorRollup): string {
  return c.login ?? c.name;
}

export function ContributorsStage({
  repo,
  contributors,
}: {
  repo: string;
  contributors: AuthorRollup[];
}) {
  const [filter, setFilter] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [rows, setRows] = useState<Commit[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const list = q
      ? contributors.filter((c) => authorKey(c).toLowerCase().includes(q))
      : contributors;
    return list.slice(0, 9);
  }, [contributors, filter]);

  const selected = useMemo(
    () => contributors.find((c) => authorKey(c) === selectedKey) ?? null,
    [contributors, selectedKey],
  );

  useEffect(() => {
    const first = contributors[0];
    setSelectedKey(first ? authorKey(first) : null);
  }, [contributors]);

  const load = useCallback(
    async (author: string) => {
      setLoading(true);
      setError(null);
      try {
        const result = await loadCommits(repo, { author, limit: 30 });
        setRows(result.commits);
      } catch (err) {
        setRows(null);
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    },
    [repo],
  );

  useEffect(() => {
    if (selected) {
      void load(selected.login ?? selected.email);
      return;
    }
    setRows(null);
  }, [selected, load]);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card className="p-6">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
              <Users className="size-4 text-indigo-400" /> Contributor Inspector
            </h3>
            <p className="mt-0.5 text-xs text-zinc-400">
              Pick a contributor to trace their commits
            </p>
          </div>
          <span className="rounded border border-indigo-500/20 bg-indigo-500/10 px-2 py-0.5 font-mono text-xs text-indigo-400">
            {contributors.length} tracked
          </span>
        </div>

        <div className="space-y-3">
          <label className="block text-xs font-semibold text-zinc-300" htmlFor="contributor-filter">
            Contributor
          </label>
          <Input
            id="contributor-filter"
            placeholder="filter by login…"
            value={filter}
            spellCheck={false}
            onChange={(e) => setFilter(e.target.value)}
            className="font-mono"
          />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {shown.map((c) => {
              const key = authorKey(c);
              const active = key === selectedKey;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedKey(key)}
                  className={cn(
                    "rounded-xl border p-3 text-left transition-all",
                    active
                      ? "border-indigo-500 bg-indigo-600/10 text-indigo-300"
                      : "border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-zinc-700",
                  )}
                >
                  <div className="flex items-center gap-2">
                    {c.avatar ? (
                      <img
                        src={c.avatar}
                        alt=""
                        className="size-5 rounded-full ring-1 ring-zinc-700"
                      />
                    ) : (
                      <span className="grid size-5 place-items-center rounded-full bg-zinc-800 font-mono text-[9px]">
                        {key.slice(0, 1).toUpperCase()}
                      </span>
                    )}
                    <span className="truncate text-xs font-semibold">{key}</span>
                  </div>
                  <div className="mt-1 font-mono text-[10px] text-zinc-500">
                    {nf.format(c.commits)} commits
                  </div>
                </button>
              );
            })}
            {shown.length === 0 && (
              <p className="text-xs text-zinc-500 sm:col-span-3">No contributor matches.</p>
            )}
          </div>

          <Button
            variant="gradient"
            className="w-full py-2.5"
            disabled={!selected || loading}
            onClick={() => {
              if (selected) void load(selected.login ?? selected.email);
            }}
          >
            {loading ? <Loader2 className="animate-spin" /> : <Search />}
            {loading ? "Executing Simulated Transport…" : "Load Commits For Contributor"}
          </Button>
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
          <div className="flex items-center gap-2">
            <Terminal className="size-4 text-indigo-400" />
            <h3 className="text-sm font-semibold text-zinc-100">Evaluated Response Output</h3>
          </div>
          <span className="font-mono text-[10px] text-zinc-500">JSON Format</span>
        </div>

        <div className="code-glow min-h-40 flex-1 overflow-y-auto rounded-xl border border-zinc-800/80 bg-zinc-950 p-4 font-mono text-xs">
          {error ? (
            <pre className="text-rose-400">{error}</pre>
          ) : loading ? (
            <span className="text-zinc-500">Loading…</span>
          ) : rows === null ? (
            <span className="text-zinc-500">Select a contributor.</span>
          ) : rows.length === 0 ? (
            <span className="text-zinc-500">No commits found for that author.</span>
          ) : (
            <pre className="text-emerald-400/90 whitespace-pre-wrap">
              {JSON.stringify(
                {
                  author: selected ? authorKey(selected) : null,
                  commits: rows.map((c) => ({
                    sha: c.shortSha,
                    date: c.date,
                    subject: c.subject,
                  })),
                },
                null,
                2,
              )}
            </pre>
          )}
        </div>

        <div className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 text-xs text-zinc-400">
          <span>Also exposed over MCP:</span>
          <code className="font-mono text-emerald-400">trace_contributors</code>
        </div>
      </Card>
    </div>
  );
}

/* ---------------------------------------------------------------- hot files */

export function HotFilesStage({
  repo,
  files,
  graph,
  onInspect,
}: {
  repo: string;
  files: HotFile[];
  graph: FileGraph;
  onInspect: (file: HotFile) => void;
}) {
  const [kind, setKind] = useState<KindFilter>("all");
  const [view, setView] = useState<"ranked" | "graph">("ranked");
  const [historyPath, setHistoryPath] = useState("");
  const [diffPath, setDiffPath] = useState("");

  const shown = useMemo(
    () => (kind === "all" ? files : files.filter((f) => classifyPath(f.path) === kind)),
    [files, kind],
  );

  const rows = useMemo(
    () =>
      shown.map((f) => ({
        path: f.path,
        commits: f.commits,
        additions: f.additions,
        deletions: f.deletions,
        churn: f.churn,
      })),
    [shown],
  );

  return (
    <div className="space-y-4">
      <Card className="flex flex-row flex-wrap items-center justify-between gap-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-zinc-400">Filter Stream:</span>
          {KIND_FILTERS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              aria-pressed={kind === k}
              className={cn(
                "rounded-lg px-2.5 py-1 font-mono text-xs font-medium uppercase transition-all",
                kind === k
                  ? "bg-indigo-600 text-white"
                  : "border border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-200",
              )}
            >
              {k}
            </button>
          ))}

          <div className="flex rounded-xl border border-zinc-800 bg-zinc-900/60 p-1">
            {(
              [
                { id: "ranked", label: "Ranked", icon: List },
                { id: "graph", label: "Knowledge graph", icon: Share2 },
              ] as const
            ).map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setView(option.id)}
                aria-pressed={view === option.id}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-medium whitespace-nowrap transition-colors",
                  view === option.id
                    ? "bg-zinc-800 text-zinc-100"
                    : "text-zinc-400 hover:text-zinc-200",
                )}
              >
                <option.icon className="size-3" />
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-zinc-500">
            {view === "ranked"
              ? `${shown.length} files ranked`
              : `${graph.nodes.length} files · ${graph.links.length} links`}
          </span>
          <ExportMenu rows={rows} filename={`${repo.replace("/", "-")}-hot-files`} />
        </div>
      </Card>

      {view === "graph" ? (
        <Card className="p-4">
          <FileGraphView graph={graph} onTraceFile={setHistoryPath} />
        </Card>
      ) : (
        <Card className="p-4">
          <Table>
            <TableHeader>
              <TableRow className="border-zinc-800 hover:bg-transparent">
                <TableHead className="font-mono text-[11px] text-zinc-500">Path</TableHead>
                <TableHead className="text-right font-mono text-[11px] text-zinc-500">
                  Commits
                </TableHead>
                <TableHead className="text-right font-mono text-[11px] text-zinc-500">
                  Additions
                </TableHead>
                <TableHead className="text-right font-mono text-[11px] text-zinc-500">
                  Deletions
                </TableHead>
                <TableHead className="text-right font-mono text-[11px] text-zinc-500">
                  Churn
                </TableHead>
                <TableHead className="text-right font-mono text-[11px] text-zinc-500">
                  Diff
                </TableHead>
                <TableHead className="text-right font-mono text-[11px] text-zinc-500">
                  Inspect
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((f) => (
                <TableRow
                  key={f.path}
                  data-active={historyPath === f.path}
                  className="border-zinc-900 data-[active=true]:bg-indigo-500/5"
                >
                  <TableCell className="max-w-[380px] truncate p-0 font-mono text-xs">
                    <button
                      type="button"
                      onClick={() => setHistoryPath(f.path)}
                      title="File history"
                      className="w-full truncate px-2 py-2 text-left text-zinc-200 transition-colors hover:text-cyan-400"
                    >
                      {f.path}
                    </button>
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs text-zinc-300">
                    {f.commits}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs text-emerald-400">
                    +{nf.format(f.additions)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs text-rose-400">
                    −{nf.format(f.deletions)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs text-cyan-400">
                    {nf.format(f.churn)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => setDiffPath(f.path)}
                      title="Show the patches for this file"
                    >
                      <GitCompare /> Diff
                    </Button>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => onInspect(f)}
                      title="The underlying record as the JSON API returned it"
                    >
                      <Eye /> Inspect
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {shown.length === 0 && (
                <TableRow className="border-0 hover:bg-transparent">
                  <TableCell colSpan={7} className="py-6 text-center text-xs text-zinc-500">
                    No files in this bucket.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      )}

      <FileHistoryDialog
        repo={repo}
        path={historyPath}
        open={historyPath !== ""}
        onOpenChange={(open) => !open && setHistoryPath("")}
      />
      <DiffDialog
        repo={repo}
        path={diffPath}
        open={diffPath !== ""}
        onOpenChange={(open) => !open && setDiffPath("")}
      />
    </div>
  );
}

/* ------------------------------------------------------------- file history */

/** The selected file's history, in a dialog so the table stays put. */
function FileHistoryDialog({
  repo,
  path,
  open,
  onOpenChange,
}: {
  repo: string;
  path: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [history, setHistory] = useState<FileTouch[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !path) return;
    let cancelled = false;
    setHistory(null);
    setError(null);
    loadFileHistory(repo, path)
      .then((r) => {
        if (!cancelled) setHistory(r.history);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [open, repo, path]);

  const totals = useMemo(() => {
    const list = history ?? [];
    return {
      commits: list.length,
      additions: list.reduce((sum, t) => sum + t.additions, 0),
      deletions: list.reduce((sum, t) => sum + t.deletions, 0),
    };
  }, [history]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="font-mono">
            File History — <span className="truncate text-cyan-400">{path}</span>
          </DialogTitle>
          <DialogDescription>
            Every commit in the traced window that touched this file, newest first.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4 overflow-y-auto pr-1">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[
              { label: "Commits Touching", value: nf.format(totals.commits) },
              { label: "Lines Added", value: `+${nf.format(totals.additions)}` },
              { label: "Lines Removed", value: `−${nf.format(totals.deletions)}` },
            ].map((s) => (
              <div
                key={s.label}
                className="space-y-3 rounded-xl border border-zinc-800/80 bg-zinc-950 p-4"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-200">{s.label}</span>
                  <Check className="size-3.5 text-emerald-400" />
                </div>
                <div className="border-t border-zinc-900 pt-2 font-mono text-lg text-zinc-100">
                  {s.value}
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <div className="text-xs font-semibold text-zinc-300">History Output</div>
            <div className="min-h-40 space-y-1.5 rounded-xl border border-zinc-800/90 bg-zinc-950 p-4 font-mono text-xs">
              {error ? (
                <div className="text-rose-400">{error}</div>
              ) : history === null ? (
                <div className="text-zinc-500">
                  <Loader2 className="mr-2 inline size-3 animate-spin" />
                  Tracing {path}…
                </div>
              ) : history.length === 0 ? (
                <div className="text-zinc-500">Not touched in the recent window.</div>
              ) : (
                history.map((t) => (
                  <div key={t.sha} className="flex flex-wrap items-center gap-x-3 text-zinc-400">
                    <span className="text-indigo-400">{t.shortSha}</span>
                    <span
                      className={cn(
                        t.status === "removed"
                          ? "text-rose-400"
                          : t.status === "added"
                            ? "text-emerald-400"
                            : "text-amber-400",
                      )}
                    >
                      {t.status}
                    </span>
                    <span className="text-emerald-400">+{t.additions}</span>
                    <span className="text-rose-400">−{t.deletions}</span>
                    <span className="text-zinc-600">{day.format(new Date(t.date))}</span>
                    <span className="min-w-0 flex-1 truncate text-zinc-300">{t.subject}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </DialogBody>

        <div className="flex justify-end">
          <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------------------------------------------------------------- docs */

export function DocsStage({ repo }: { repo: string }) {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const token = useToken();
  const prefs = usePrefs();
  const mcpConfig = JSON.stringify(
    {
      mcpServers: {
        "git-trace": {
          type: "http",
          url: `${origin}/mcp`,
        },
      },
    },
    null,
    2,
  );

  const rows: Array<[string, React.ReactNode]> = [
    ["Runtime", "Cloudflare Workers"],
    ["Transport", "MCP Streamable HTTP (stateless)"],
    ["Edge cache", `${prefs.cacheTtlSeconds === 0 ? "off" : `${prefs.cacheTtlSeconds}s`}`],
    [
      "GitHub auth",
      token ? (
        <span className="text-emerald-400">your token</span>
      ) : (
        <span className="text-amber-400">unauthenticated · 60 req/h</span>
      ),
    ],
    ["Repository", repo || "—"],
    ["Source", "GitHub REST API"],
  ];

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <Card className="gap-5 p-6 lg:col-span-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
          <BookOpen className="size-4 text-indigo-400" /> Cursor / Claude MCP Configuration
        </h3>
        <p className="text-xs leading-relaxed text-zinc-400">
          Add the following server entry to your{" "}
          <code className="font-mono text-indigo-300">claude_desktop_config.json</code> or Cursor
          MCP settings to hook this deployment into your IDE context window.
        </p>

        <div className="code-glow overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-950 p-4 font-mono text-xs text-zinc-200">
          <pre>{mcpConfig}</pre>
        </div>

        <div className="space-y-3 border-t border-zinc-800 pt-4">
          <h4 className="text-xs font-semibold text-zinc-200">Exposed MCP Tools Reference</h4>
          <div className="space-y-2">
            {MCP_TOOLS.map(([name, description]) => (
              <div
                key={name}
                className="rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-3 text-xs leading-relaxed"
              >
                <span className="font-mono font-bold text-indigo-400">{name}</span>
                <span className="text-zinc-400"> — {description}</span>
              </div>
            ))}
          </div>
          <p className="font-mono text-[11px] text-zinc-500">
            Resource: <span className="text-cyan-400">git-trace://repository/summary</span> ·
            Prompt: <span className="text-cyan-400">history-review</span>
          </p>
        </div>
      </Card>

      <div className="space-y-6">
        <Card className="gap-4 p-6">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
            <Cpu className="size-4 text-indigo-400" /> System Information
          </h3>
          <div className="space-y-3 font-mono text-xs text-zinc-400">
            {rows.map(([label, value]) => (
              <div
                key={label}
                className="flex justify-between gap-4 border-b border-zinc-800 py-1 last:border-0"
              >
                <span>{label}</span>
                <span className="text-right text-zinc-200">{value}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="gap-3 p-6">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
            <Database className="size-4 text-indigo-400" /> Traced Surfaces
          </h3>
          <p className="text-xs leading-relaxed text-zinc-400">
            The dashboard, the MCP tools and the JSON API all answer from one shared
            <code className="mx-1 font-mono text-indigo-300">TraceService</code>, so they can never
            disagree.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            {["/api/trace", "/api/commits", "/api/hot-files", "/api/file-history", "/mcp"].map(
              (endpoint) => (
                <Badge key={endpoint} variant="secondary">
                  {endpoint}
                </Badge>
              ),
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

/* Re-exported so the shell can render the settings dialog body without a
 * second module. */
export function SystemSettings({ config }: { config: DeploymentConfig | null }) {
  const token = useToken();
  const prefs = usePrefs();
  const [draft, setDraft] = useState("");

  const save = () => {
    setToken(draft);
    setDraft("");
  };

  const clear = () => {
    setToken("");
    setDraft("");
  };

  const auth = token
    ? { tone: "text-emerald-400", text: "Using your token from this browser" }
    : { tone: "text-amber-400", text: "Unauthenticated · 60 requests/hour" };

  return (
    <div className="space-y-4 font-mono text-xs">
      <div className="space-y-2">
        <span className="block text-[11px] text-zinc-400">GitHub token</span>
        <div className="flex gap-2">
          <Input
            type="password"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && draft.trim()) save();
            }}
            placeholder={token ? "•••••••• saved" : "ghp_… or github_pat_…"}
            autoComplete="off"
            spellCheck={false}
            aria-label="GitHub token"
            className="font-mono"
          />
          <Button size="sm" onClick={save} disabled={!draft.trim()}>
            Save
          </Button>
          <Button size="sm" variant="outline" onClick={clear} disabled={!token}>
            Clear
          </Button>
        </div>
        <p className={cn("flex items-center gap-1.5 text-[11px]", auth.tone)}>
          <span className="size-1.5 rounded-full bg-current" />
          {auth.text}
        </p>
        <p className="text-[11px] leading-relaxed text-zinc-500">
          Kept in this browser and sent as a request header — never stored on the deployment. Raises
          the limit to 5000 requests/hour and unlocks private repositories.
        </p>
      </div>

      <div>
        <span className="mb-1 block text-[11px] text-zinc-400">MCP endpoint</span>
        <code className="block rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-emerald-400">
          {typeof window === "undefined" ? "/mcp" : `${window.location.origin}/mcp`}
        </code>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-800 pt-3">
        <span className="flex items-center gap-2 text-zinc-400">
          <Flame className="size-3.5 text-indigo-400" /> Edge cache TTL
        </span>
        <Select
          value={String(prefs.cacheTtlSeconds)}
          onValueChange={(next) => setPrefs({ cacheTtlSeconds: Number(next) })}
        >
          <SelectTrigger className="w-36" aria-label="Edge cache TTL">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CACHE_TTLS.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <p className="text-[11px] leading-relaxed text-zinc-500">
        How long this browser lets the edge keep a GitHub answer. Long is cheap and fast; turn it
        off while a repository is moving. Sent per request, so it is not a deployment setting — this
        deployment's own default is{" "}
        <span className="text-zinc-300">
          {config?.cacheTtlSeconds === 0 ? "off" : `${config?.cacheTtlSeconds ?? "?"}s`}
        </span>
        .
      </p>
    </div>
  );
}
