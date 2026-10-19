/**
 * The Files tab: the repository's listing at one branch or tag, with the
 * selected file beside it. The listing, the refs and the file are separate
 * requests, made only while this tab is open — none of them ride the trace.
 *
 * The tree is `@pierre/trees`: it renders into a shadow root, ships VS Code-style
 * file icons, virtualises long listings and brings its own search. Its colours
 * are driven by the `.file-tree` custom properties in `tailwind.css`, so it
 * inherits the dashboard's theme and accent rather than carrying a palette.
 *
 * Text is highlighted by the grammars registered in `lib/highlight.ts`; media
 * comes from `/api/raw`, which streams bytes the contents API will not inline.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  FileText,
  GitBranch,
  RefreshCw,
  Tag,
} from "lucide-react";
import { FileTree, useFileTree } from "@pierre/trees/react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { MarkdownBody } from "@/components/markdown";
import { ApiError, loadFile, loadRaw, loadRefs, loadTag, loadTree } from "@/api";
import { PrismLight, languageFor, prismStyle } from "@/lib/highlight";
import { ancestorsOf, buildTree, defaultFilePath, flattenFiles } from "@/lib/file-tree";
import { isInlineMedia, mediaType } from "../../core/media";
import { useAppearance } from "@/lib/theme";
import { cn } from "@/lib/utils";
import type { FileContent, RepoRefs, RepoTree, TagDetail } from "../../core/types";

const MARKDOWN = /\.(md|mdx|markdown)$/i;

/**
 * Above this many characters a file is shown as plain text. Prism tokenises on
 * the main thread, and a few hundred KB of minified source or a lockfile takes
 * long enough to freeze the tab — unhighlighted text is still readable.
 */
const HIGHLIGHT_LIMIT = 100_000;

/** Both panes share one height so the two cards line up at top and bottom. */
const PANE = "h-[68vh] min-h-[18rem]";

function bytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

/** A 409 here means the repository has no commits, not that anything failed. */
function messageFor(err: unknown): string {
  if (err instanceof ApiError && err.status === 409) {
    return "This repository has no commits yet, so there are no files to list.";
  }
  return err instanceof Error ? err.message : String(err);
}

function fileName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/**
 * The tree model is created once per mount, so the component is keyed by repo
 * and ref: a different listing gets a fresh model with fresh expansion state.
 */
function RepoTree({
  files,
  initial,
  onSelect,
}: {
  files: string[];
  initial: string;
  onSelect: (path: string) => void;
}) {
  const fileSet = useMemo(() => new Set(files), [files]);
  // What the tree reported last time, so a fresh click can be told apart from
  // rows that were already selected.
  const seen = useRef(new Set(initial ? [initial] : []));

  const { model } = useFileTree({
    paths: files,
    // Only the `complete` set carries per-language colours.
    icons: "complete",
    density: "compact",
    search: true,
    initialSelectedPaths: initial ? [initial] : [],
    initialExpandedPaths: ancestorsOf(initial),
    onSelectionChange: (next) => {
      const added = next.filter((path) => !seen.current.has(path));
      seen.current = new Set(next);
      // The selection is a set in insertion order, so the newly added path is
      // the row the reader picked — taking the last entry instead would jump to
      // a row they merely kept selected. Directories can be selected too.
      const picked = [...added].reverse().find((path) => fileSet.has(path));
      if (picked) onSelect(picked);
    },
  });

  return <FileTree model={model} className={cn("file-tree", PANE)} />;
}

function Viewer({
  repo,
  at,
  path,
  file,
  error,
  loading,
  mode,
}: {
  repo: string;
  /** The branch or tag the file is being read at. */
  at: string;
  path: string;
  file: FileContent | null;
  error: string;
  loading: boolean;
  mode: "dark" | "light";
}) {
  const [media, setMedia] = useState<{ url: string; type: string; size: number } | null>(null);
  const [mediaError, setMediaError] = useState("");
  const [copied, setCopied] = useState(false);

  const type = mediaType(path);
  const inline = isInlineMedia(type);
  const githubUrl = `https://github.com/${repo}/blob/${at || "HEAD"}/${path
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/")}`;

  useEffect(() => {
    setMedia(null);
    setMediaError("");
    if (!repo || !path || !inline) return;
    let cancelled = false;
    let url = "";
    loadRaw(repo, path, at)
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setMedia({ url, type, size: blob.size });
      })
      .catch((err: unknown) => {
        if (!cancelled) setMediaError(messageFor(err));
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [repo, path, at, inline, type]);

  const language = languageFor(path);
  const isMarkdown = MARKDOWN.test(path);
  // Both the highlighter and the Markdown parser build one node per token; past
  // the limit that is what locks the tab up, so neither runs.
  const heavy = (file?.text?.length ?? 0) > HIGHLIGHT_LIMIT;

  const copy = () => {
    void navigator.clipboard
      .writeText(file?.text ?? "")
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => setCopied(false));
  };

  const download = () => {
    void loadRaw(repo, path, at).then((blob) => {
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName(path);
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  };

  return (
    <Card className="min-h-0 p-4">
      <div className="flex h-9 flex-none items-center justify-between gap-3 border-b border-zinc-800 pb-3">
        <h3 className="flex min-w-0 items-center gap-2 font-mono text-sm font-semibold text-zinc-100">
          <FileText className="size-4 flex-none text-indigo-400" />
          <span className="truncate" title={path}>
            {path || "No file selected"}
          </span>
        </h3>
        <div className="flex flex-none items-center gap-2">
          {file ? (
            <span className="font-mono text-[11px] text-zinc-500">{bytes(file.size)}</span>
          ) : media ? (
            <span className="font-mono text-[11px] text-zinc-500">{bytes(media.size)}</span>
          ) : null}
          {file && file.text !== null ? (
            <Button variant="outline" size="xs" onClick={copy}>
              {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
              {copied ? "Copied" : "Copy"}
            </Button>
          ) : null}
          {path ? (
            <>
              <Button variant="outline" size="xs" onClick={download}>
                <Download className="size-3" /> Download
              </Button>
              <a
                className={buttonVariants({ variant: "outline", size: "xs" })}
                href={githubUrl}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink className="size-3" /> GitHub
              </a>
            </>
          ) : null}
        </div>
      </div>

      {/* Fixed height, not `flex-1`: in an auto-height column a zero basis wins
          over the height and the pane collapses to its minimum. */}
      <div className={cn(PANE, "overflow-auto")}>
        {error || mediaError ? (
          <p className="text-xs text-zinc-400">{error || mediaError}</p>
        ) : loading && !inline ? (
          <div className="space-y-2">
            <Skeleton className="h-5 w-1/3 rounded-md" />
            <Skeleton className="h-40 rounded-xl" />
          </div>
        ) : !path ? (
          <p className="text-xs text-zinc-400">
            {repo
              ? "Select a file to read it here."
              : "Name a repository on the Overview tab to read its files."}
          </p>
        ) : inline ? (
          media ? (
            type.startsWith("image/") ? (
              <div className="flex h-full items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
                <img
                  src={media.url}
                  alt={fileName(path)}
                  className="max-h-full max-w-full object-contain"
                />
              </div>
            ) : type.startsWith("video/") ? (
              <video
                src={media.url}
                controls
                className="max-h-full w-full rounded-xl border border-zinc-800 bg-black"
              />
            ) : type.startsWith("audio/") ? (
              <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
                <audio src={media.url} controls className="w-full" />
              </div>
            ) : (
              <iframe
                src={media.url}
                title={path}
                className="h-full w-full rounded-xl border border-zinc-800 bg-white"
              />
            )
          ) : (
            <div className="space-y-2">
              <Skeleton className="h-40 rounded-xl" />
            </div>
          )
        ) : !file ? (
          <p className="text-xs text-zinc-400">Loading the file…</p>
        ) : file.text === null ? (
          <p className="text-xs text-zinc-400">
            GitHub will not inline this file — it is binary, or larger than its 1 MB limit. Use
            <span className="text-zinc-200"> Download</span> to read it locally.
          </p>
        ) : isMarkdown && !heavy ? (
          <MarkdownBody text={file.text} fill />
        ) : language && !heavy ? (
          <PrismLight
            language={language}
            style={prismStyle(mode)}
            showLineNumbers
            customStyle={{
              margin: 0,
              padding: "1rem",
              borderRadius: "0.75rem",
              border: "1px solid var(--color-zinc-800)",
              background: "var(--color-zinc-950)",
              textShadow: "none",
              fontSize: "0.75rem",
              lineHeight: 1.6,
              minHeight: "100%",
              overflowX: "auto",
            }}
            // The theme paints its own slate background on the inline <code>,
            // which draws a band behind the text runs and reads as a selection.
            codeTagProps={{ style: { background: "transparent", textShadow: "none" } }}
            lineNumberStyle={{ color: "var(--color-zinc-600)", minWidth: "2.5em" }}
          >
            {file.text}
          </PrismLight>
        ) : (
          <>
            {heavy ? (
              <p className="mb-2 text-[11px] text-zinc-500">
                {bytes(file.size)} of text — shown unhighlighted, because tokenising a file this
                size blocks the tab.
              </p>
            ) : null}
            <pre
              className={cn(
                "rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 font-mono text-xs leading-relaxed whitespace-pre text-zinc-300",
                !heavy && "h-full",
              )}
            >
              {file.text}
            </pre>
          </>
        )}
      </div>
    </Card>
  );
}

export function FilesStage({ repo }: { repo: string }) {
  const appearance = useAppearance();
  const [tree, setTree] = useState<RepoTree | null>(null);
  const [treeError, setTreeError] = useState("");
  const [treeLoading, setTreeLoading] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // "" means "whatever the repository's default branch is"; the tree response
  // names the ref it actually resolved to.
  const [ref, setRef] = useState("");
  const [refs, setRefs] = useState<RepoRefs | null>(null);

  // The tag being inspected, if any. A tag is a ref like a branch, so picking
  // one also moves the listing to it — the dialog is the point of the trip.
  const [tagName, setTagName] = useState("");
  const [tag, setTag] = useState<TagDetail | null>(null);
  const [tagError, setTagError] = useState("");
  const [tagLoading, setTagLoading] = useState(false);
  const [tagOpen, setTagOpen] = useState(false);
  const tagRequest = useRef(0);

  const [selected, setSelected] = useState("");
  const [file, setFile] = useState<FileContent | null>(null);
  const [fileError, setFileError] = useState("");
  const [fileLoading, setFileLoading] = useState(false);

  useEffect(() => {
    if (!repo) {
      setRefs(null);
      return;
    }
    let cancelled = false;
    loadRefs(repo)
      .then((next) => {
        if (!cancelled) setRefs(next);
      })
      .catch(() => {
        // The picker is a convenience: the default branch still works without it.
        if (!cancelled) setRefs(null);
      });
    return () => {
      cancelled = true;
    };
  }, [repo]);

  useEffect(() => {
    if (!repo) {
      setTree(null);
      setSelected("");
      return;
    }
    let cancelled = false;
    setTreeLoading(true);
    setTreeError("");
    setTree(null);
    setSelected("");
    loadTree(repo, ref || undefined)
      .then((next) => {
        if (cancelled) return;
        setTree(next);
        setSelected(defaultFilePath(flattenFiles(buildTree(next.entries))) ?? "");
      })
      .catch((err: unknown) => {
        if (!cancelled) setTreeError(messageFor(err));
      })
      .finally(() => {
        if (!cancelled) setTreeLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [repo, ref, attempt]);

  useEffect(() => {
    // Media comes from /api/raw; asking for its text would decode to null and
    // waste a request, so it never reaches this effect.
    if (!repo || !selected || isInlineMedia(mediaType(selected))) {
      setFile(null);
      return;
    }
    let cancelled = false;
    // Clear first: leaving the previous file's text under a new path header
    // would show the wrong content for as long as the request takes.
    setFile(null);
    setFileLoading(true);
    setFileError("");
    loadFile(repo, selected, ref || undefined)
      .then((next) => {
        if (!cancelled) setFile(next);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setFile(null);
        setFileError(messageFor(err));
      })
      .finally(() => {
        if (!cancelled) setFileLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [repo, selected, ref]);

  const files = useMemo(() => (tree ? flattenFiles(buildTree(tree.entries)) : []), [tree]);
  // The ref every read is pinned to. Falls back to the listing's own answer so a
  // file never arrives from a different ref than the tree it was picked from.
  const at = ref || tree?.ref || "";
  const tags = useMemo(
    () => (refs ? refs.tags.filter((name) => !refs.branches.includes(name)) : []),
    [refs],
  );

  /** Picking a tag browses that ref and opens its notes in the same move. */
  const openTag = (name: string) => {
    const request = ++tagRequest.current;
    setTagName(name);
    setRef(name);
    setTagOpen(true);
    setTag(null);
    setTagError("");
    setTagLoading(true);
    loadTag(repo, name)
      .then((next) => {
        if (request === tagRequest.current) setTag(next);
      })
      .catch((err: unknown) => {
        if (request === tagRequest.current) setTagError(messageFor(err));
      })
      .finally(() => {
        if (request === tagRequest.current) setTagLoading(false);
      });
  };

  return (
    <>
      <div className="grid gap-5 lg:grid-cols-[minmax(15rem,19rem)_1fr]">
        <Card className="min-h-0 p-4">
          <div className="flex h-9 flex-none items-center gap-2 border-b border-zinc-800 pb-3">
            <h3 className="sr-only">Files</h3>
            <Select
              value={tagName ? "" : at}
              onValueChange={(name) => {
                setTagName("");
                setRef(name);
              }}
              disabled={!refs}
            >
              <SelectTrigger
                className="h-7 min-w-0 flex-1 gap-1.5 border-zinc-800 bg-zinc-900/60 px-2 font-mono text-[11px]"
                aria-label="Branch"
              >
                <GitBranch className="size-3 flex-none text-zinc-500" />
                <SelectValue placeholder={tree?.ref ?? "branch"} />
              </SelectTrigger>
              <SelectContent>
                {refs?.branches.map((name) => (
                  <SelectItem key={name} value={name} className="font-mono text-xs">
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={tagName} onValueChange={openTag} disabled={tags.length === 0}>
              <SelectTrigger
                className="h-7 min-w-0 flex-1 gap-1.5 border-zinc-800 bg-zinc-900/60 px-2 font-mono text-[11px]"
                aria-label="Tag"
              >
                <Tag className="size-3 flex-none text-zinc-500" />
                <SelectValue placeholder={tags.length === 0 ? "no tags" : "tag"} />
              </SelectTrigger>
              <SelectContent>
                {tags.map((name) => (
                  <SelectItem key={name} value={name} className="font-mono text-xs">
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="xs"
              className="flex-none"
              onClick={() => setAttempt((n) => n + 1)}
              disabled={!repo || treeLoading}
              aria-label="Reload the tree at this ref"
            >
              <RefreshCw className={cn("size-3", treeLoading && "animate-spin")} />
            </Button>
          </div>

          {treeError ? (
            <p className="text-xs text-zinc-400">{treeError}</p>
          ) : treeLoading ? (
            <div className="space-y-1.5">
              {Array.from({ length: 10 }, (_, i) => (
                <Skeleton key={i} className="h-5 rounded-md" />
              ))}
            </div>
          ) : !repo ? (
            <p className="text-xs text-zinc-400">
              Name a repository on the Overview tab to browse its files.
            </p>
          ) : files.length === 0 ? (
            <p className="text-xs text-zinc-400">No files to list.</p>
          ) : (
            <RepoTree
              key={`${repo}:${at}`}
              files={files}
              initial={selected}
              onSelect={setSelected}
            />
          )}

          {tree?.truncated ? (
            <p className="flex-none text-[11px] text-amber-400">
              GitHub capped this listing — very large repositories are truncated.
            </p>
          ) : null}
        </Card>

        <Viewer
          repo={repo}
          at={at}
          path={selected}
          file={file}
          error={fileError}
          loading={fileLoading}
          mode={appearance.mode}
        />
      </div>

      <Dialog open={tagOpen} onOpenChange={setTagOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex min-w-0 items-center gap-2 font-mono">
              <Tag className="size-4 flex-none text-indigo-400" />
              <span className="truncate">{tagName}</span>
              {tag ? (
                <Badge variant={tag.kind === "release" ? "default" : "secondary"}>
                  {tag.kind === "release" ? "Release" : "Tag"}
                </Badge>
              ) : null}
              {tag?.prerelease ? <Badge variant="warning">Pre-release</Badge> : null}
            </DialogTitle>
            <DialogDescription>
              {tag
                ? `${tag.author ?? "unknown author"}${
                    tag.publishedAt ? ` · ${new Date(tag.publishedAt).toLocaleString()}` : ""
                  }`
                : "Loading what this tag points at…"}
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-3 overflow-y-auto pr-1">
            {tagError ? (
              <p className="text-xs text-rose-400">{tagError}</p>
            ) : tagLoading ? (
              <p className="text-xs text-zinc-500">Loading release details…</p>
            ) : tag ? (
              <>
                <p className="text-xs text-zinc-400">
                  {tag.kind === "release"
                    ? "Published release notes for this tag."
                    : "This tag has no published release, so its commit is shown instead."}
                </p>
                {tag.body ? (
                  <MarkdownBody text={tag.body} />
                ) : (
                  <p className="text-xs text-zinc-500">No notes on this tag.</p>
                )}
              </>
            ) : null}
          </DialogBody>

          <DialogFooter className="flex items-center justify-between gap-2">
            <span className="font-mono text-[11px] text-zinc-500">
              {tag?.sha ? `commit ${tag.sha.slice(0, 7)}` : ""}
            </span>
            {tag ? (
              <a
                className={buttonVariants({ variant: "outline", size: "xs" })}
                href={tag.url}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink className="size-3" /> Open on GitHub
              </a>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
