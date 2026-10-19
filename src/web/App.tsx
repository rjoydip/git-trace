import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  BookOpen,
  Copy,
  Flame,
  FolderTree,
  Gauge,
  GitPullRequest,
  Layers,
  MessageSquare,
  RefreshCw,
  Settings,
  Terminal,
  Users,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CommitTimeline,
  ContributorsStage,
  DocsStage,
  HotFilesStage,
  MetricRow,
  PromptExportCard,
  RepoSummaryCard,
  RepoTargetPanel,
  SystemSettings,
} from "@/components/dashboard";
import { SimulatorStudio, TelemetryStream, TestMatrix } from "@/components/studio";
import { TrackStage } from "@/components/track";
import { CommentsStage } from "@/components/comments";

/**
 * The file browser carries the tree view and every syntax grammar, so it is
 * split into its own chunk: readers who never open the tab never download it.
 */
const FilesStage = lazy(() =>
  import("@/components/files").then((module) => ({ default: module.FilesStage })),
);
import { GitTraceMark } from "@/components/brand";
import { AppearanceSettings, ThemeToggle } from "@/components/theme-controls";
import {
  ApiError,
  callMcpTool,
  getConfig,
  loadTrace,
  type DeploymentConfig,
  type TracePayload,
} from "@/api";
import { cn } from "@/lib/utils";
import type { FileGraph, HotFile } from "../core/types";

const RECENT_KEY = "git-trace:recent";

/** Stable identity: a fresh literal each render would reset the graph's camera. */
const EMPTY_GRAPH: FileGraph = { nodes: [], links: [] };

function readRecent(): string[] {
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === "string").slice(0, 5)
      : [];
  } catch {
    return [];
  }
}

function pushRecent(list: string[], repo: string): string[] {
  const next = [repo, ...list.filter((r) => r !== repo)].slice(0, 5);
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable (private mode) — the preset list just stays empty.
  }
  return next;
}

/**
 * One hue per tab, so the strip is scannable at a glance. The hue stays put when
 * the tab is selected: only the label brightens, the icon keeps its own colour.
 */
const TABS = [
  { id: "overview", label: "Overview", icon: Gauge, tone: "text-sky-400" },
  { id: "history", label: "Commits", icon: Layers, tone: "text-emerald-400" },
  { id: "comments", label: "Comments", icon: MessageSquare, tone: "text-cyan-400" },
  { id: "track", label: "PR / Issue", icon: GitPullRequest, tone: "text-violet-400" },
  { id: "contributors", label: "Contributors", icon: Users, tone: "text-amber-400" },
  { id: "hot-files", label: "Hot Files", icon: Flame, tone: "text-orange-400" },
  { id: "files", label: "Files", icon: FolderTree, tone: "text-teal-400" },
  { id: "simulator", label: "Simulator", icon: Zap, tone: "text-yellow-400" },
  { id: "telemetry", label: "Telemetry", icon: Terminal, tone: "text-lime-400" },
  { id: "tests", label: "Tests", icon: RefreshCw, tone: "text-rose-400" },
  { id: "docs", label: "Docs", icon: BookOpen, tone: "text-purple-400" },
] as const;

interface ShellError {
  message: string;
  status: number;
}

export function App() {
  const [input, setInput] = useState(() => readRecent()[0] ?? "");
  const [target, setTarget] = useState("");
  const [repo, setRepo] = useState("");
  const [data, setData] = useState<TracePayload | null>(null);
  const [config, setConfig] = useState<DeploymentConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ShellError | null>(null);
  const [tab, setTab] = useState<string>("overview");
  const [live, setLive] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [inspect, setInspect] = useState<{ title: string; payload: unknown } | null>(null);
  const [recent, setRecent] = useState<string[]>(() => readRecent());

  const activeRepo = repo || target;
  const emptyRepo = error?.status === 409;

  const run = useCallback(async (name: string) => {
    const wanted = name.trim();
    if (!wanted) return;
    setLoading(true);
    setError(null);
    setTarget(wanted);
    // Panels belong to the trace that produced them: clear them so a fresh
    // target never renders the previous repository's cards under a new name.
    setData(null);
    try {
      const payload = await loadTrace(wanted);
      setData(payload);
      setRepo(payload.repo);
      setInput(payload.repo);
      setRecent((prev) => pushRecent(prev, payload.repo));
    } catch (err) {
      setData(null);
      setError({
        message: err instanceof Error ? err.message : String(err),
        status: err instanceof ApiError ? err.status : 0,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    // There is no default repository: the dashboard opens empty unless the URL
    // names one. A pasted ?repo= is an explicit choice, not a default.
    const fromUrl = new URLSearchParams(window.location.search).get("repo");
    getConfig()
      .then((c) => {
        if (!cancelled) setConfig(c);
      })
      .catch(() => {
        // The settings readout degrades; tracing itself is unaffected.
      })
      .finally(() => {
        if (!cancelled && fromUrl) void run(fromUrl);
      });
    return () => {
      cancelled = true;
    };
  }, [run]);

  // "Live" streams a real tools/call on an interval. One GitHub request per
  // tick, served from the edge cache for GITHUB_CACHE_TTL seconds.
  useEffect(() => {
    if (!live || !activeRepo) return;
    const id = window.setInterval(() => {
      void callMcpTool("trace_activity", { repo: activeRepo, limit: 5 });
    }, 15_000);
    return () => window.clearInterval(id);
  }, [live, activeRepo]);

  return (
    <Tabs
      value={tab}
      onValueChange={setTab}
      className="flex min-h-screen flex-col gap-0 antialiased selection:bg-indigo-500/30 selection:text-indigo-200"
    >
      <header className="sticky top-0 z-40 border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur-xl">
        {/* Phone: brand and actions share row one, the tabs scroll on row two.
            Desktop: one row, tabs scroll between the brand and the actions. */}
        <div className="mx-auto flex max-w-8xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 lg:flex-nowrap lg:px-8 lg:py-3">
          <div className="flex shrink-0 items-center gap-2.5">
            <div className="group relative">
              <div className="absolute -inset-0.5 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-300 opacity-60 blur transition duration-300 group-hover:opacity-90" />
              <div className="relative flex size-8 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 sm:size-9">
                <GitTraceMark className="size-4.5" />
              </div>
            </div>
            <div>
              <h1 className="text-base leading-tight font-semibold tracking-tight text-zinc-100">
                GitTrace
              </h1>
              <div className="mt-0.5 hidden items-center gap-2 sm:flex">
                <span className="flex items-center gap-1.5 text-[10px] font-medium text-emerald-400">
                  <span className="relative flex size-2">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75 motion-reduce:animate-none" />
                    <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
                  </span>
                  {loading ? "Tracing" : data ? "Connected" : "Idle"}
                </span>
              </div>
            </div>
          </div>

          <div className="order-2 ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2 lg:order-3 lg:ml-0">
            <Button
              variant="outline"
              size="sm"
              className={cn(
                "font-mono",
                live
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                  : "text-zinc-400 hover:text-zinc-200",
              )}
              onClick={() => setLive((v) => !v)}
              disabled={!activeRepo}
              aria-pressed={live}
              title={live ? "Stop streaming telemetry" : "Stream a live tool call every 15s"}
            >
              <span
                className={cn(
                  "size-2 rounded-full",
                  live ? "animate-pulse bg-emerald-500" : "bg-zinc-600",
                )}
              />
              <span className="hidden sm:inline">{live ? "Live" : "Paused"}</span>
            </Button>

            <ThemeToggle />

            <Button
              variant="outline"
              size="icon"
              title="Appearance and server settings"
              aria-label="Settings"
              onClick={() => setSettingsOpen(true)}
            >
              <Settings />
            </Button>
          </div>

          <div className="no-scrollbar order-3 w-full overflow-x-auto lg:order-2 lg:min-w-0 lg:flex-1">
            <TabsList>
              {TABS.map((t) => (
                <TabsTrigger key={t.id} value={t.id} title={t.label}>
                  <t.icon className={t.tone} />
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-8xl flex-1 space-y-6 px-4 py-6 lg:space-y-8 lg:px-8 lg:py-8">
        {error &&
          (emptyRepo ? (
            <Card className="gap-2 p-5">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
                <AlertCircle className="size-4 text-amber-400" /> No commits to trace
              </h3>
              <p className="text-xs leading-relaxed text-zinc-400">
                <span className="font-mono text-zinc-200">{activeRepo}</span> exists on GitHub but
                its default branch is empty, so there is no history yet. Push a first commit, or
                trace a different repository from the Overview tab.
              </p>
            </Card>
          ) : (
            <Card className="border-rose-500/30 p-4">
              <p className="font-mono text-xs text-rose-400">
                {error.status ? `${error.status} · ` : ""}
                {error.message}
              </p>
            </Card>
          ))}

        {/* The trace header lives in its own tab: the target, the headline
            numbers and the prompt export are one screen, not a band over every
            other screen. */}
        <TabsContent value="overview" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 font-mono text-[10px] tracking-wide text-zinc-500 uppercase">
              <Gauge className="size-3.5 text-indigo-400" /> Trace Header
            </h2>
            {data && (
              <Badge variant="secondary" className="font-mono text-[10px]">
                {data.meta.fullName} · {data.meta.defaultBranch}
              </Badge>
            )}
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <RepoTargetPanel
              value={input}
              onChange={setInput}
              onSubmit={() => void run(input)}
              onRefresh={() => void run(activeRepo)}
              busy={loading}
              recent={recent}
            />

            <div className="space-y-5 lg:col-span-2">
              {data ? (
                <MetricRow stats={data.stats} meta={data.meta} />
              ) : loading ? (
                <MetricSkeleton />
              ) : (
                <EmptyPanel message="No repository traced yet — name one on the left." />
              )}

              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                {data ? (
                  <RepoSummaryCard meta={data.meta} stats={data.stats} />
                ) : loading ? (
                  <Skeleton className="h-56 rounded-2xl" />
                ) : null}

                {data ? (
                  <PromptExportCard
                    payload={{
                      meta: data.meta,
                      stats: data.stats,
                      contributors: data.contributors,
                      hotFiles: data.hotFiles,
                      commits: data.commits,
                    }}
                  />
                ) : loading ? (
                  <Skeleton className="h-40 rounded-2xl" />
                ) : null}
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="history">
          {data ? (
            <CommitTimeline commits={data.commits} activity={data.activity} />
          ) : loading ? (
            <TimelineSkeleton />
          ) : (
            <EmptyPanel message="Name a repository on the Overview tab to build its chronological timeline." />
          )}
        </TabsContent>

        <TabsContent value="comments">
          {data ? (
            <CommentsStage commits={data.commits} />
          ) : loading ? (
            <TimelineSkeleton />
          ) : (
            <EmptyPanel message="Name a repository on the Overview tab to read its commit commentary." />
          )}
        </TabsContent>

        <TabsContent value="track">
          <TrackStage repo={activeRepo} />
        </TabsContent>

        <TabsContent value="contributors">
          {data ? (
            <ContributorsStage repo={data.repo} contributors={data.contributors} />
          ) : loading ? (
            <Skeleton className="h-[28rem] rounded-2xl" />
          ) : (
            <EmptyPanel message="Name a repository on the Overview tab to rank its contributors." />
          )}
        </TabsContent>

        <TabsContent value="hot-files">
          {data ? (
            <HotFilesStage
              repo={data.repo}
              files={data.hotFiles}
              graph={data.fileGraph ?? EMPTY_GRAPH}
              onInspect={(f: HotFile) => setInspect({ title: f.path, payload: f })}
            />
          ) : loading ? (
            <Skeleton className="h-[28rem] rounded-2xl" />
          ) : (
            <EmptyPanel message="Name a repository on the Overview tab to rank its files by churn." />
          )}
        </TabsContent>

        <TabsContent value="files">
          <Suspense fallback={<Skeleton className="h-[68vh] rounded-2xl" />}>
            {/* Keyed by repo: the tree, the ref picker and the open file are all
                per-repository state, and a remount is cheaper than resetting
                each of them by hand. */}
            <FilesStage key={activeRepo} repo={activeRepo} />
          </Suspense>
        </TabsContent>

        <TabsContent value="simulator">
          <SimulatorStudio repo={activeRepo} />
        </TabsContent>

        <TabsContent value="telemetry">
          <TelemetryStream />
        </TabsContent>

        <TabsContent value="tests">
          <TestMatrix repo={activeRepo} />
        </TabsContent>

        <TabsContent value="docs">
          <DocsStage repo={activeRepo} />
        </TabsContent>
      </main>

      <Dialog open={inspect !== null} onOpenChange={(open) => !open && setInspect(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-mono">
              Raw record — <span className="truncate text-cyan-400">{inspect?.title}</span>
            </DialogTitle>
            <DialogDescription>
              The unchanged record behind this row, exactly as the JSON API returned it.
            </DialogDescription>
          </DialogHeader>

          <DialogBody>
            <div className="code-glow max-h-[350px] overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-950 p-4 font-mono text-xs">
              <pre className="text-emerald-400">
                {JSON.stringify(inspect?.payload ?? null, null, 2)}
              </pre>
            </div>
          </DialogBody>

          <DialogFooter className="flex justify-end">
            <Button
              variant="secondary"
              onClick={() =>
                void navigator.clipboard.writeText(
                  JSON.stringify(inspect?.payload ?? null, null, 2),
                )
              }
            >
              <Copy /> Copy JSON
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              <Settings className="size-4 text-indigo-400" /> Settings
            </DialogTitle>
            <DialogDescription>
              Appearance is stored in this browser; the server section is read-only.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-6 overflow-y-auto pr-1">
            <section className="space-y-3">
              <h4 className="font-mono text-[10px] tracking-wide text-zinc-500 uppercase">
                Appearance
              </h4>
              <AppearanceSettings />
            </section>

            <section className="space-y-3 border-t border-zinc-800 pt-5">
              <h4 className="font-mono text-[10px] tracking-wide text-zinc-500 uppercase">
                Server configuration
              </h4>
              <SystemSettings config={config} />
            </section>
          </DialogBody>

          <DialogFooter className="flex justify-end">
            <Button variant="outline" onClick={() => setSettingsOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Tabs>
  );
}

function EmptyPanel({ message }: { message: string }) {
  return (
    <Card className="p-12">
      <p className="text-center text-xs text-zinc-400">{message}</p>
    </Card>
  );
}

/* Each panel owns its placeholder, so a trace reports progress section by
 * section instead of blanking the whole page. */
function MetricSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-28 rounded-2xl" />
      ))}
    </div>
  );
}

function TimelineSkeleton() {
  return <Skeleton className="h-[28rem] rounded-2xl" />;
}
