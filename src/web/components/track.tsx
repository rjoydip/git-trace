import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CircleDot,
  Clock,
  ExternalLink,
  FileText,
  GitCommit,
  GitMerge,
  GitPullRequest,
  Loader2,
  MessageSquare,
  ShieldCheck,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { loadItems, loadTrack } from "@/api";
import { MarkdownBody } from "@/components/markdown";
import { cn } from "@/lib/utils";
import type {
  ItemKind,
  ItemState,
  ItemSummary,
  TrackedActivity,
  TrackedItem,
} from "../../core/types";

const STATES: Array<{ id: ItemState; name: string }> = [
  { id: "open", name: "Open" },
  { id: "closed", name: "Closed" },
  { id: "all", name: "All" },
];

const KIND_FILTERS: Array<{ id: ItemKind | "all"; name: string }> = [
  { id: "all", name: "Everything" },
  { id: "pull", name: "Pull requests" },
  { id: "issue", name: "Issues" },
];

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function formatMoment(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

function StateBadge({
  state,
  draft,
  merged,
}: {
  state: "open" | "closed";
  draft: boolean;
  merged: boolean;
}) {
  if (draft) return <Badge variant="secondary">DRAFT</Badge>;
  if (merged) return <Badge variant="default">MERGED</Badge>;
  if (state === "open") return <Badge variant="success">OPEN</Badge>;
  return <Badge variant="destructive">CLOSED</Badge>;
}

function ActivityIcon({ entry }: { entry: TrackedActivity }) {
  if (entry.kind === "commit") return <GitCommit className="size-3.5 text-emerald-400" />;
  if (entry.kind === "review") return <ShieldCheck className="size-3.5 text-indigo-400" />;
  return <MessageSquare className="size-3.5 text-cyan-400" />;
}

/** The list row's filters, applied to what the API already returned. */
function matches(item: ItemSummary, kind: ItemKind | "all", search: string): boolean {
  if (kind !== "all" && item.kind !== kind) return false;
  const needle = search.trim().toLowerCase();
  if (!needle) return true;
  return [
    item.title,
    `#${item.number}`,
    String(item.number),
    item.author.login,
    ...item.labels.map((l) => l.name),
  ]
    .join("\n")
    .toLowerCase()
    .includes(needle);
}

export function TrackStage({ repo }: { repo: string }) {
  const [item, setItem] = useState<TrackedItem | null>(null);
  const [loading, setLoading] = useState(false);

  const [state, setState] = useState<ItemState>("open");
  const [kindFilter, setKindFilter] = useState<ItemKind | "all">("all");
  const [search, setSearch] = useState("");
  const [list, setList] = useState<ItemSummary[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  // The repository's pull requests and issues, refetched when the state filter
  // changes. Kind and text are filtered here, so those two are instant.
  useEffect(() => {
    setItem(null);
    if (!repo) {
      setList([]);
      return;
    }

    let cancelled = false;
    setListLoading(true);
    setListError(null);
    loadItems(repo, state)
      .then((res) => {
        if (!cancelled) setList(res.items);
      })
      .catch((err: unknown) => {
        if (!cancelled) setListError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setListLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [repo, state]);

  const visible = useMemo(
    () => list.filter((entry) => matches(entry, kindFilter, search)),
    [list, kindFilter, search],
  );

  const open = async (target: string, number: number, itemKind: ItemKind) => {
    setLoading(true);
    setItem(null);
    try {
      setItem(await loadTrack(target, number, itemKind));
    } catch (err) {
      setListError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="gap-5 p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800 pb-4">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
              <GitPullRequest className="size-4 text-indigo-400" /> Pull Requests &amp; Issues
            </h3>
            <p className="mt-0.5 text-xs text-zinc-400">
              Fetched from the live API and filtered here — pick a row to reassemble its timeline,
              reviews and discussion
            </p>
          </div>
          <Badge variant="secondary">{repo || "no repository"}</Badge>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[9rem_11rem_1fr]">
          <Select value={state} onValueChange={(next) => setState(next as ItemState)}>
            <SelectTrigger aria-label="State">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATES.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={kindFilter}
            onValueChange={(next) => setKindFilter(next as ItemKind | "all")}
          >
            <SelectTrigger aria-label="Kind filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {KIND_FILTERS.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            placeholder="Filter by title, #number, author or label"
            value={search}
            spellCheck={false}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Filter items"
          />
        </div>

        {listError && (
          <p className="flex items-start gap-2 font-mono text-[11px] text-rose-400">
            <AlertCircle className="mt-px size-3.5 shrink-0" />
            {listError}
          </p>
        )}

        {listLoading ? (
          <p className="flex items-center justify-center gap-2 py-8 text-xs text-zinc-500">
            <Loader2 className="size-3.5 animate-spin" /> Loading pull requests and issues…
          </p>
        ) : !repo ? (
          <p className="py-8 text-center text-xs text-zinc-500">
            Name a repository on the Overview tab to list its pull requests and issues.
          </p>
        ) : visible.length === 0 ? (
          <p className="py-8 text-center text-xs text-zinc-500">
            {list.length === 0
              ? `No ${state === "all" ? "" : `${state} `}pull requests or issues found.`
              : "No rows match this filter."}
          </p>
        ) : (
          <>
            <div className="max-h-80 divide-y divide-zinc-800/70 overflow-y-auto">
              {visible.map((entry) => {
                const selected = item?.kind === entry.kind && item.number === entry.number;
                return (
                  <button
                    key={`${entry.kind}-${entry.number}`}
                    type="button"
                    onClick={() => void open(repo, entry.number, entry.kind)}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-zinc-800/40",
                      selected && "bg-zinc-800/40",
                    )}
                  >
                    {entry.kind === "pull" ? (
                      <GitPullRequest className="mt-0.5 size-3.5 shrink-0 text-indigo-400" />
                    ) : (
                      <CircleDot className="mt-0.5 size-3.5 shrink-0 text-emerald-400" />
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="truncate text-xs font-medium text-zinc-200">
                          {entry.title}
                        </span>
                        <span className="shrink-0 font-mono text-[10px] text-zinc-500">
                          #{entry.number}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10px] text-zinc-500">
                        <StateBadge state={entry.state} draft={entry.draft} merged={entry.merged} />
                        <span>@{entry.author.login}</span>
                        <span>updated {formatDate(entry.updatedAt)}</span>
                        {entry.comments > 0 && (
                          <span className="flex items-center gap-1">
                            <MessageSquare className="size-3" />
                            {entry.comments}
                          </span>
                        )}
                        {entry.labels.slice(0, 3).map((label) => (
                          <span key={label.name} className="flex items-center gap-1">
                            <span
                              className="size-2 rounded-full"
                              style={{ backgroundColor: `#${label.color}` }}
                            />
                            {label.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            <p className="text-right font-mono text-[10px] text-zinc-500">
              {visible.length} of {list.length} shown
            </p>
          </>
        )}
      </Card>

      {/* The detail and its timeline open over the list, so the filters and the
          reader's place in it survive. */}
      <Dialog
        open={item !== null || loading}
        onOpenChange={(isOpen) => {
          if (!isOpen) setItem(null);
        }}
      >
        <DialogContent className="max-w-3xl">
          {loading || !item ? (
            <p className="flex items-center justify-center gap-2 py-16 text-xs text-zinc-500">
              <Loader2 className="size-4 animate-spin" /> Reassembling the timeline…
            </p>
          ) : (
            <>
              <DialogHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={item.kind === "pull" ? "default" : "info"}>
                    {item.kind === "pull" ? "PULL" : "ISSUE"} #{item.number}
                  </Badge>
                  <StateBadge state={item.state} draft={item.draft} merged={item.merged} />
                  {item.labels.map((label) => (
                    <span
                      key={label.name}
                      className="inline-flex items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-900/60 px-2 py-0.5 text-[10px] text-zinc-300"
                    >
                      <span
                        className="size-2 rounded-full"
                        style={{ backgroundColor: `#${label.color}` }}
                      />
                      {label.name}
                    </span>
                  ))}
                </div>

                <DialogTitle className="mt-2 text-base leading-snug">{item.title}</DialogTitle>

                <DialogDescription className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px]">
                  <span className="flex items-center gap-1.5">
                    {item.author.avatar && (
                      <img
                        src={item.author.avatar}
                        alt=""
                        className="size-4 rounded-full"
                        loading="lazy"
                      />
                    )}
                    <span className="text-zinc-300">{item.author.login}</span>
                  </span>
                  <span>opened {formatDate(item.createdAt)}</span>
                  <span>·</span>
                  <span>updated {formatDate(item.updatedAt)}</span>
                  <span>·</span>
                  <span>
                    {item.comments} comment{item.comments === 1 ? "" : "s"}
                  </span>
                </DialogDescription>
              </DialogHeader>

              <DialogBody className="space-y-5 overflow-y-auto pr-1">
                {item.kind === "pull" && (
                  <div className="grid grid-cols-2 gap-4 rounded-xl border border-zinc-800/80 bg-zinc-950 p-4 sm:grid-cols-5">
                    {[
                      ["Base", item.base ?? "—"],
                      ["Head", item.head ?? "—"],
                      ["Commits", String(item.commitCount)],
                      ["Files", String(item.changedFiles)],
                      [
                        "Churn",
                        `+${item.additions.toLocaleString()} −${item.deletions.toLocaleString()}`,
                      ],
                    ].map(([label, value]) => (
                      <div key={label} className="space-y-1">
                        <div className="font-mono text-[10px] tracking-wide text-zinc-500 uppercase">
                          {label}
                        </div>
                        <div className="truncate font-mono text-xs text-zinc-200">{value}</div>
                      </div>
                    ))}
                  </div>
                )}

                {item.body && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 font-mono text-[10px] tracking-wide text-zinc-500 uppercase">
                      <FileText className="size-3" /> Description
                    </div>
                    <MarkdownBody text={item.body} baseUrl={`https://github.com/${repo}/`} />
                  </div>
                )}

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-mono text-[10px] tracking-wide text-zinc-500 uppercase">
                      <GitMerge className="size-3" /> Timeline
                    </div>
                    <span className="font-mono text-[11px] text-zinc-500">
                      {item.activity.length} event{item.activity.length === 1 ? "" : "s"} · newest
                      first
                    </span>
                  </div>

                  {item.activity.length === 0 ? (
                    <p className="py-6 text-center text-xs text-zinc-500">
                      No commits, reviews or comments recorded on this {item.kind}.
                    </p>
                  ) : (
                    <ol className="stagger space-y-1">
                      {item.activity.map((entry) => (
                        <li
                          key={entry.id}
                          className="flex items-start gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-zinc-800/40"
                        >
                          <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900">
                            <ActivityIcon entry={entry} />
                          </span>

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-baseline gap-2">
                              <span className="text-xs font-medium text-zinc-200">
                                {entry.actor.login}
                              </span>
                              <Badge variant="secondary">{entry.kind}</Badge>
                              <span className="font-mono text-[10px] text-zinc-500">
                                {formatMoment(entry.at)}
                              </span>
                            </div>
                            <p className="mt-0.5 text-xs text-zinc-400">{entry.text}</p>
                          </div>

                          {entry.url && (
                            <a
                              href={entry.url}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="mt-0.5 shrink-0 text-zinc-600 transition-colors hover:text-zinc-300"
                              aria-label="Open event on GitHub"
                            >
                              <ExternalLink className="size-3.5" />
                            </a>
                          )}
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              </DialogBody>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-[10px] text-zinc-500">
                  {item.kind === "pull" ? "pull request" : "issue"} #{item.number}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(item.url, "_blank", "noopener")}
                  >
                    <ExternalLink /> Open on GitHub
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => setItem(null)}>
                    Close
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {!item && !loading && !repo && (
        <Card className="p-12">
          <p className="flex items-center justify-center gap-2 text-center text-xs text-zinc-500">
            <Clock className="size-3.5" />
            Nothing tracked yet — name a repository on the Overview tab.
          </p>
        </Card>
      )}
    </div>
  );
}
