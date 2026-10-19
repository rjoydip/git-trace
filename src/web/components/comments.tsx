import { useMemo, useState } from "react";
import { ExternalLink, MessageSquare, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MarkdownBody } from "@/components/markdown";
import {
  authorTallies,
  commitAuthor,
  commitBody,
  filterCommits,
  type CommitOrder,
} from "@/lib/commits";
import { cn } from "@/lib/utils";
import type { Commit } from "../../core/types";

const moment = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

const MODES = [
  { id: "body", label: "With body" },
  { id: "all", label: "All commits" },
] as const;

/** Page sizes, matching the Commits tab's "Show" control. */
const SIZES = ["12", "25", "50", "all"] as const;

/**
 * Commit commentary as a reading feed. The Commits tab shows subjects on a
 * timeline; this tab is where the full messages live. Author, text and order
 * come from the same filter the Commits tab uses, so a filter means the same
 * thing on both.
 */
export function CommentsStage({ commits }: { commits: Commit[] }) {
  const [mode, setMode] = useState<(typeof MODES)[number]["id"]>("body");
  const [query, setQuery] = useState("");
  const [author, setAuthor] = useState("all");
  const [order, setOrder] = useState<CommitOrder>("newest");
  const [limit, setLimit] = useState("12");

  const withBody = useMemo(() => commits.filter((c) => commitBody(c) !== ""), [commits]);
  const authors = useMemo(() => authorTallies(commits), [commits]);

  const matched = useMemo(
    () => filterCommits(commits, { author, query, order, hasBody: mode === "body" }),
    [commits, mode, author, query, order],
  );

  const visible = limit === "all" ? matched : matched.slice(0, Number(limit));

  const emptyText =
    commits.length === 0
      ? "Trace a repository to read its commit commentary."
      : mode === "body" && withBody.length === 0
        ? `None of the ${commits.length} traced commits carry a message body — switch to “All commits” to read the subjects.`
        : "No commit matches these filters.";

  return (
    <div className="space-y-6">
      <Card className="gap-5 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 pb-4">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
              <MessageSquare className="size-4 text-indigo-400" /> Commit Commentary
            </h3>
            <p className="mt-0.5 text-xs text-zinc-400">
              Every traced commit message in full — the discussion the graph only summarises
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{withBody.length} with body</Badge>
            <Badge variant="secondary">{commits.length} traced</Badge>
            <span className="rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1 font-mono text-xs text-zinc-400">
              {visible.length === matched.length
                ? `${matched.length} Comments`
                : `${visible.length} of ${matched.length} Comments`}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="flex shrink-0 rounded-xl border border-zinc-800 bg-zinc-900/60 p-1">
            {MODES.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setMode(f.id)}
                aria-pressed={mode === f.id}
                className={cn(
                  "rounded-lg px-2.5 py-1 text-[11px] font-medium whitespace-nowrap transition-colors",
                  mode === f.id ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:text-zinc-200",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="relative lg:flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-zinc-500" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by message, author or sha"
              spellCheck={false}
              className="pl-9"
              aria-label="Filter comments"
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <Select value={author} onValueChange={setAuthor}>
              <SelectTrigger className="w-40" aria-label="Filter comments by author">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All authors ({commits.length})</SelectItem>
                {authors.map((a) => (
                  <SelectItem key={a.name} value={a.name}>
                    {a.name} ({a.count})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={order} onValueChange={(next) => setOrder(next as CommitOrder)}>
              <SelectTrigger className="w-36" aria-label="Comment order">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest first</SelectItem>
                <SelectItem value="oldest">Oldest first</SelectItem>
              </SelectContent>
            </Select>

            <Select value={limit} onValueChange={setLimit}>
              <SelectTrigger className="w-32" aria-label="Comments shown">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SIZES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s === "all" ? "Show all" : `Show ${s}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {visible.length === 0 ? (
        <Card className="p-10 sm:p-12">
          <p className="text-center text-xs text-zinc-500">{emptyText}</p>
        </Card>
      ) : (
        <ol className="stagger space-y-4">
          {visible.map((c) => {
            const body = commitBody(c);
            return (
              <li
                key={c.sha}
                className="group flex gap-3 border-l-2 border-zinc-800 pl-4 transition-colors hover:border-indigo-500/60 sm:gap-4 sm:pl-5"
              >
                <div className="shrink-0 pt-0.5">
                  {c.author.avatar ? (
                    <img
                      src={c.author.avatar}
                      alt=""
                      width={28}
                      height={28}
                      loading="lazy"
                      className="size-7 rounded-full ring-1 ring-zinc-700"
                    />
                  ) : (
                    <span className="grid size-7 place-items-center rounded-full bg-zinc-800 font-mono text-[10px] text-zinc-300">
                      {commitAuthor(c).slice(0, 1).toUpperCase()}
                    </span>
                  )}
                </div>

                <div className="min-w-0 flex-1 space-y-2 pb-4">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-xs font-semibold text-zinc-200">@{commitAuthor(c)}</span>
                    <Badge variant="info">{c.shortSha}</Badge>
                    <span className="font-mono text-[10px] text-zinc-500">
                      {moment.format(new Date(c.date))}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-start gap-2">
                    <a
                      href={c.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-xs font-medium text-zinc-100 transition-colors hover:text-indigo-400"
                    >
                      {c.subject}
                    </a>
                    <a
                      href={c.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      aria-label="Open commit on GitHub"
                      className="mt-0.5 shrink-0 text-zinc-600 transition-colors hover:text-zinc-300"
                    >
                      <ExternalLink className="size-3" />
                    </a>
                  </div>

                  {body && <MarkdownBody text={body} />}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {visible.length < matched.length && (
        <button
          type="button"
          onClick={() => setLimit("all")}
          className="w-full rounded-xl border border-zinc-800 bg-zinc-900/60 py-2 font-mono text-xs text-zinc-400 transition-colors hover:border-zinc-700 hover:text-zinc-100"
        >
          Show the remaining {matched.length - visible.length} of {matched.length} matches
        </button>
      )}
    </div>
  );
}
