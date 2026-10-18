/**
 * A file's patches, newest first, fetched only when the dialog opens — the
 * trace payload deliberately carries aggregates, not diffs.
 */
import { useEffect, useState } from "react";
import { AlertCircle, Copy, GitCommit, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { loadDiffs } from "@/api";
import { cn } from "@/lib/utils";
import type { FileDiff } from "../../core/types";

const day = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

/** Unified diff, coloured by line prefix. Context lines stay neutral. */
function Patch({ patch }: { patch: string }) {
  return (
    <pre className="overflow-x-auto font-mono text-[11px] leading-[1.6]">
      {patch.split("\n").map((line, i) => {
        const tone = line.startsWith("@@")
          ? "text-cyan-400"
          : line.startsWith("+")
            ? "text-emerald-400"
            : line.startsWith("-")
              ? "text-rose-400"
              : line.startsWith("\\")
                ? "text-zinc-600"
                : "text-zinc-500";
        return (
          <div key={i} className={cn(tone, line.startsWith("@@") && "bg-cyan-500/5")}>
            {line || " "}
          </div>
        );
      })}
    </pre>
  );
}

export function DiffDialog({
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
  const [diffs, setDiffs] = useState<FileDiff[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open || !path) return;
    let cancelled = false;
    setDiffs(null);
    setError(null);
    loadDiffs(repo, path)
      .then((res) => {
        if (!cancelled) setDiffs(res.diffs);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [open, repo, path]);

  const combined = (diffs ?? [])
    .map(
      (d) =>
        `commit ${d.sha}\nAuthor: ${d.author}\nDate: ${d.date}\n\n    ${d.subject}\n\n${d.patch}`,
    )
    .join("\n\n");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="font-mono">
            Diff — <span className="truncate text-cyan-400">{path}</span>
          </DialogTitle>
          <DialogDescription>
            Patches from the most recent commits that touched this file, newest first.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4 overflow-y-auto pr-1">
          {error ? (
            <p className="flex items-start gap-2 font-mono text-[11px] text-rose-400">
              <AlertCircle className="mt-px size-3.5 shrink-0" />
              {error}
            </p>
          ) : diffs === null ? (
            <p className="flex items-center gap-2 py-8 text-xs text-zinc-500">
              <Loader2 className="size-3.5 animate-spin" /> Loading patches…
            </p>
          ) : diffs.length === 0 ? (
            <p className="py-8 text-center text-xs text-zinc-500">
              No patch available in the recent window — GitHub omits diffs for large or binary
              files.
            </p>
          ) : (
            diffs.map((diff) => (
              <div key={diff.sha} className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="info">{diff.shortSha}</Badge>
                  <span className="flex items-center gap-1.5 text-xs text-zinc-300">
                    <GitCommit className="size-3.5 text-emerald-400" />
                    {diff.subject}
                  </span>
                  <span className="font-mono text-[10px] text-zinc-500">
                    {diff.author} · {day.format(new Date(diff.date))}
                  </span>
                </div>
                <div className="code-glow overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 p-3">
                  <Patch patch={diff.patch} />
                </div>
              </div>
            ))
          )}
        </DialogBody>

        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!combined}
            onClick={() =>
              void navigator.clipboard.writeText(combined).then(() => {
                setCopied(true);
                window.setTimeout(() => setCopied(false), 2000);
              })
            }
          >
            <Copy /> {copied ? "Copied" : "Copy patch"}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
