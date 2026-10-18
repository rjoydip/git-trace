import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Check, Eye, Loader2, Play, RefreshCw, ShieldCheck, Terminal, X, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ExportMenu } from "@/components/export-menu";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MCP_TOOLS } from "@/components/dashboard";
import { callMcpTool, listMcpTools, probe } from "@/api";
import {
  clearTelemetry,
  subscribeTelemetry,
  telemetrySnapshot,
  type TelemetryEvent,
} from "@/lib/telemetry";
import { cn } from "@/lib/utils";

/* --------------------------------------------------------- Simulator Studio */

interface Preset {
  key: string;
  title: string;
  tool: string;
  args: Record<string, unknown>;
}

/** Scenario presets — the arguments the control room opens with. */
function presetsFor(repo: string): Preset[] {
  return [
    { key: "summary", title: "Repository Summary", tool: "trace_repository", args: { repo } },
    {
      key: "hotfiles",
      title: "Hot File Ranking",
      tool: "trace_hot_files",
      args: { repo, limit: 10 },
    },
    {
      key: "activity",
      title: "Activity Window",
      tool: "trace_activity",
      args: { repo, limit: 30 },
    },
  ];
}

/** Everything in the preset except `repo`, which the field above pins. */
function editableArgs(args: Record<string, unknown>): Record<string, unknown> {
  const rest = { ...args };
  delete rest.repo;
  return rest;
}

export function SimulatorStudio({ repo }: { repo: string }) {
  const presets = useMemo(() => presetsFor(repo), [repo]);
  const [presetKey, setPresetKey] = useState("summary");
  const [tool, setTool] = useState("trace_repository");
  const [argsText, setArgsText] = useState("{}");
  const [payload, setPayload] = useState<unknown>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [latency, setLatency] = useState(0);
  const [running, setRunning] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  // Selecting a preset (or tracing a different repo) reloads the arguments.
  // The target is not part of them: it belongs to the field above.
  useEffect(() => {
    const preset = presets.find((p) => p.key === presetKey) ?? presets[0];
    if (!preset) return;
    setTool(preset.tool);
    setArgsText(JSON.stringify(editableArgs(preset.args), null, 2));
  }, [presets, presetKey]);

  const fire = async () => {
    let extra: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(argsText);
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Arguments must be a JSON object");
      }
      extra = parsed as Record<string, unknown>;
    } catch (err) {
      setParseError(err instanceof Error ? err.message : String(err));
      return;
    }

    setParseError(null);
    setRunning(true);
    setPayload(null);
    setStatus(null);
    // The traced target always wins, even if the JSON still carries a `repo`.
    const args: Record<string, unknown> = { ...extra };
    if (repo.trim()) args.repo = repo.trim();
    try {
      const result = await callMcpTool(tool, args);
      setPayload(result.payload);
      setStatus(result.status);
      setLatency(result.latency);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card className="gap-5 p-6">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
              <Zap className="size-4 text-cyan-400" /> Interactive MCP Generator
            </h3>
            <p className="mt-0.5 text-xs text-zinc-400">
              Fire a real tools/call at this deployment's MCP endpoint
            </p>
          </div>
          <Badge variant="default">Streamable HTTP</Badge>
        </div>

        <div className="space-y-3">
          <span className="block text-xs font-semibold text-zinc-300">Scenario Presets</span>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {presets.map((preset) => (
              <button
                key={preset.key}
                type="button"
                onClick={() => setPresetKey(preset.key)}
                className={cn(
                  "rounded-xl border p-3 text-left transition-all",
                  presetKey === preset.key
                    ? "border-indigo-500 bg-indigo-600/10 text-indigo-300"
                    : "border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-zinc-700",
                )}
              >
                <div className="truncate text-xs font-semibold">{preset.title}</div>
                <div className="mt-1 truncate font-mono text-[10px] text-zinc-500">
                  {preset.tool}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <label className="block text-xs font-semibold text-zinc-300" htmlFor="sim-tool">
            Tool
          </label>
          <Select value={tool} onValueChange={setTool}>
            <SelectTrigger id="sim-tool" className="font-mono">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MCP_TOOLS.map(([name]) => (
                <SelectItem key={name} value={name} className="font-mono">
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className="block text-xs font-semibold text-zinc-300" htmlFor="sim-repo">
            Repository
          </label>
          <Input
            id="sim-repo"
            readOnly
            value={repo}
            placeholder="No target traced yet"
            aria-readonly="true"
            className="font-mono text-zinc-400"
          />
          <p className="text-[10px] text-zinc-500">
            Pinned to the traced target — every tool call carries this repository.
          </p>
        </div>

        <div className="space-y-2">
          <label className="block text-xs font-semibold text-zinc-300" htmlFor="sim-args">
            MCP Tool Call Arguments (JSON)
          </label>
          <Textarea
            id="sim-args"
            rows={8}
            spellCheck={false}
            value={argsText}
            onChange={(e) => setArgsText(e.target.value)}
            className="min-h-40"
          />
          {parseError && <p className="font-mono text-[11px] text-rose-400">{parseError}</p>}
          {!repo.trim() && (
            <p className="font-mono text-[11px] text-amber-400">
              Trace a repository first — every tool requires one.
            </p>
          )}
        </div>

        <Button
          variant="gradient"
          className="w-full py-2.5"
          onClick={() => void fire()}
          disabled={running}
        >
          {running ? <RefreshCw className="animate-spin" /> : <Play className="fill-current" />}
          {running ? "Executing Simulated Transport…" : "Fire Simulated MCP Tool RPC Payload"}
        </Button>
      </Card>

      <Card className="gap-4 p-6">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
          <div className="flex items-center gap-2">
            <Terminal className="size-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-zinc-100">Evaluated Response Output</h3>
          </div>
          <span className="font-mono text-[10px] text-zinc-500">JSON Format</span>
        </div>

        <div className="code-glow min-h-60 flex-1 overflow-y-auto rounded-xl border border-zinc-800/80 bg-zinc-950 p-4 font-mono text-xs">
          {running ? (
            <span className="text-zinc-500">
              <Loader2 className="mr-2 inline size-3 animate-spin" />
              Calling {tool}…
            </span>
          ) : payload === null ? (
            <span className="text-zinc-500">Fire a preset to inspect the tool's payload.</span>
          ) : (
            <pre className="whitespace-pre-wrap text-emerald-400">
              {JSON.stringify(payload, null, 2)}
            </pre>
          )}
        </div>

        <div className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 text-xs text-zinc-400">
          <span>Live stream sync state:</span>
          {status ? (
            <span className="font-mono font-medium text-emerald-400">
              {status} · {latency}ms · synced to Telemetry
            </span>
          ) : (
            <span className="font-mono text-zinc-500">idle</span>
          )}
        </div>
      </Card>
    </div>
  );
}

/* ---------------------------------------------------------- Telemetry Stream */

const LOG_FILTERS = ["all", "tools_call", "api", "error"] as const;
type LogFilter = (typeof LOG_FILTERS)[number];

function matches(event: TelemetryEvent, filter: LogFilter): boolean {
  if (filter === "all") return true;
  if (filter === "tools_call") return event.kind === "mcp";
  if (filter === "api") return event.kind === "api";
  return !event.ok;
}

export function TelemetryStream() {
  const events = useSyncExternalStore(subscribeTelemetry, telemetrySnapshot, telemetrySnapshot);
  const [filter, setFilter] = useState<LogFilter>("all");
  const [selected, setSelected] = useState<TelemetryEvent | null>(null);
  const [pageSize, setPageSize] = useState("25");
  const [page, setPage] = useState(1);

  const shown = useMemo(() => events.filter((e) => matches(e, filter)), [events, filter]);

  // The console is unbounded while "Live" streams, so the table is paged. The
  // page is clamped rather than reset, which would yank the reader backwards on
  // every new event.
  const size = pageSize === "all" ? shown.length || 1 : Number(pageSize);
  const pages = Math.max(1, Math.ceil(shown.length / size));
  const current = Math.min(page, pages);
  const start = (current - 1) * size;
  const pageRows = pageSize === "all" ? shown : shown.slice(start, start + size);

  useEffect(() => {
    setPage(1);
  }, [filter, pageSize]);

  // The capture, flattened for the copy/download control — the detail dialogs
  // stay JSON because they inspect one event's nested params and result.
  const rows = useMemo(
    () =>
      shown.map((e) => ({
        time: e.time,
        kind: e.kind,
        method: e.method,
        target: e.target,
        status: e.status,
        ok: e.ok,
        latency_ms: e.latency,
      })),
    [shown],
  );

  return (
    <div className="space-y-4">
      <Card className="flex flex-row flex-wrap items-center justify-between gap-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-zinc-400">Filter Stream:</span>
          {LOG_FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-lg px-2.5 py-1 font-mono text-xs font-medium uppercase transition-all",
                filter === f
                  ? "bg-indigo-600 text-white"
                  : "border border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-200",
              )}
            >
              {f}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className="font-mono text-xs text-zinc-500">{shown.length} Events captured</span>
          <ExportMenu rows={rows} filename="git-trace-telemetry" />
          <Button variant="outline" size="xs" onClick={clearTelemetry}>
            Clear Console
          </Button>
        </div>
      </Card>

      <Card className="gap-3 p-4">
        <div className="max-h-[26rem] overflow-auto rounded-lg border border-zinc-800/60">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-zinc-950">
              <TableRow className="border-zinc-800 hover:bg-transparent">
                <TableHead className="font-mono text-[11px] text-zinc-500">Timestamp</TableHead>
                <TableHead className="font-mono text-[11px] text-zinc-500">Method</TableHead>
                <TableHead className="font-mono text-[11px] text-zinc-500">Tool / Target</TableHead>
                <TableHead className="font-mono text-[11px] text-zinc-500">Status</TableHead>
                <TableHead className="font-mono text-[11px] text-zinc-500">Latency</TableHead>
                <TableHead className="text-right font-mono text-[11px] text-zinc-500">
                  Inspect
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.map((event) => (
                <TableRow key={event.id} className="border-zinc-900">
                  <TableCell className="font-mono text-xs text-zinc-500">{event.time}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{event.method}</Badge>
                  </TableCell>
                  <TableCell className="max-w-[280px] truncate font-mono text-xs font-semibold text-zinc-200">
                    {event.target}
                  </TableCell>
                  <TableCell>
                    <Badge variant={event.ok ? "success" : "destructive"}>{event.status}</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-cyan-400">
                    {event.latency}ms
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="xs" onClick={() => setSelected(event)}>
                      <Eye /> Inspect
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {shown.length === 0 && (
                <TableRow className="border-0 hover:bg-transparent">
                  <TableCell colSpan={6} className="py-8 text-center text-xs text-zinc-500">
                    Nothing captured yet. Trace a repository or fire a tool call.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {shown.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-800 pt-3">
            <span className="font-mono text-[10px] text-zinc-500">
              Showing {start + 1}–
              {pageSize === "all" ? shown.length : Math.min(shown.length, start + size)} of{" "}
              {shown.length}
            </span>

            <div className="flex flex-wrap items-center gap-2">
              <Select value={pageSize} onValueChange={setPageSize}>
                <SelectTrigger
                  className="h-7 w-28 font-mono text-[11px]"
                  aria-label="Rows per page"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["10", "25", "50", "all"].map((option) => (
                    <SelectItem key={option} value={option}>
                      {option === "all" ? "All rows" : `${option} / page`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                variant="outline"
                size="xs"
                disabled={current <= 1}
                onClick={() => setPage(current - 1)}
              >
                Prev
              </Button>
              <span className="font-mono text-[10px] text-zinc-500">
                {current} / {pages}
              </span>
              <Button
                variant="outline"
                size="xs"
                disabled={current >= pages}
                onClick={() => setPage(current + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Dialog open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="pr-6 font-mono">
              Raw record #{selected?.id} — <span className="text-cyan-400">{selected?.target}</span>
            </DialogTitle>
            <DialogDescription>
              {selected?.method} · {selected?.status} · {selected?.latency}ms
            </DialogDescription>
          </DialogHeader>

          <div className="code-glow max-h-[350px] overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-950 p-4 font-mono text-xs">
            <pre className="text-emerald-400">
              {JSON.stringify(
                {
                  time: selected?.time,
                  method: selected?.method,
                  target: selected?.target,
                  status: selected?.status,
                  latency_ms: selected?.latency,
                  params: selected?.params,
                  result: selected?.result,
                },
                null,
                2,
              )}
            </pre>
          </div>

          <div className="flex justify-end">
            <ExportMenu
              rows={[
                {
                  time: selected?.time,
                  method: selected?.method,
                  target: selected?.target,
                  status: selected?.status,
                  latency_ms: selected?.latency,
                  params: selected?.params,
                  result: selected?.result,
                },
              ]}
              filename={`git-trace-telemetry-${selected?.id ?? "event"}`}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ---------------------------------------------------------------- Test Matrix */

type SuiteState = "idle" | "running" | "passed" | "failed" | "skipped";

interface SuiteResult {
  state: SuiteState;
  duration: number;
  passed: number;
  total: number;
  /** One line per failed check, so the exported matrix carries the reason. */
  failures: string[];
}

interface SuiteDef {
  id: string;
  name: string;
  target: string;
  needsRepo: boolean;
  checks: Array<{ label: string; run: () => Promise<void> }>;
}

/** The smoke matrix: every surface this deployment claims to serve. */
function buildSuites(repo: string): SuiteDef[] {
  const q = encodeURIComponent(repo);
  return [
    {
      id: "mcp",
      name: "MCP Transport",
      target: "/mcp · tools/list",
      needsRepo: false,
      checks: [
        {
          label: "tools/list",
          run: async () => {
            const result = await listMcpTools();
            if (!result.ok) throw new Error(result.status);
            if (result.tools.length === 0) throw new Error("no tools advertised");
          },
        },
      ],
    },
    {
      id: "api",
      name: "JSON API",
      target: "/api/health · /api/config · /api/repo",
      needsRepo: true,
      checks: [
        { label: "/api/health", run: async () => void (await probe("/api/health")) },
        { label: "/api/config", run: async () => void (await probe("/api/config")) },
        { label: "/api/repo", run: async () => void (await probe(`/api/repo?repo=${q}`)) },
      ],
    },
    {
      id: "trace",
      name: "Trace Pipeline",
      target: "/api/commits · /api/contributors · /api/activity",
      needsRepo: true,
      checks: [
        {
          label: "/api/commits",
          run: async () => void (await probe(`/api/commits?repo=${q}&limit=5`)),
        },
        {
          label: "/api/contributors",
          run: async () => void (await probe(`/api/contributors?repo=${q}`)),
        },
        { label: "/api/activity", run: async () => void (await probe(`/api/activity?repo=${q}`)) },
      ],
    },
  ];
}

function idleResults(suites: SuiteDef[]): Record<string, SuiteResult> {
  return Object.fromEntries(
    suites.map((s) => [
      s.id,
      { state: "idle", duration: 0, passed: 0, total: s.checks.length, failures: [] },
    ]),
  );
}

export function TestMatrix({ repo }: { repo: string }) {
  const suites = useMemo(() => buildSuites(repo), [repo]);
  const [results, setResults] = useState<Record<string, SuiteResult>>(() => idleResults(suites));
  const [lines, setLines] = useState<string[]>([]);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    setResults(idleResults(suites));
    setLines([]);
  }, [suites]);

  const push = (line: string) => setLines((prev) => [...prev, line]);

  const runAll = async () => {
    setRunning(true);
    setLines([`$ git-trace smoke --repo ${repo || "(no repository)"}`, "Running check matrix…"]);
    setResults(idleResults(suites));

    const next: Record<string, SuiteResult> = idleResults(suites);
    let passed = 0;
    let failed = 0;

    for (let i = 0; i < suites.length; i += 1) {
      const suite = suites[i];
      if (!suite) continue;

      if (suite.needsRepo && !repo) {
        next[suite.id] = {
          state: "skipped",
          duration: 0,
          passed: 0,
          total: suite.checks.length,
          failures: [],
        };
        setResults({ ...next });
        push(`→ [${i + 1}/${suites.length}] ${suite.name} — skipped (no repository)`);
        continue;
      }

      push(`→ [${i + 1}/${suites.length}] ${suite.name}: ${suite.target}`);
      setResults({
        ...next,
        [suite.id]: {
          state: "running",
          duration: 0,
          passed: 0,
          total: suite.checks.length,
          failures: [],
        },
      });

      const started = performance.now();
      const failures: string[] = [];
      let ok = 0;
      for (const check of suite.checks) {
        try {
          await check.run();
          ok += 1;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          failures.push(`${check.label}: ${message}`);
          push(`✗ ${check.label}: ${message}`);
        }
      }
      const duration = Math.round(performance.now() - started);
      const allOk = ok === suite.checks.length;
      passed += ok;
      failed += suite.checks.length - ok;
      next[suite.id] = {
        state: allOk ? "passed" : "failed",
        duration,
        passed: ok,
        total: suite.checks.length,
        failures,
      };
      setResults({ ...next });
      push(
        `${allOk ? "✓" : "✗"} ${suite.name} — ${ok}/${suite.checks.length} checks in ${duration}ms`,
      );
    }

    push("--------------------------------------------------");
    push(
      failed === 0
        ? `🎉 ${passed} checks passed successfully!`
        : `${failed} check(s) failed · ${passed} passed`,
    );
    setRunning(false);
  };

  const rows = useMemo(
    () =>
      suites.map((suite) => {
        const result = results[suite.id];
        return {
          suite: suite.name,
          target: suite.target,
          state: result?.state ?? "idle",
          checks_passed: result?.passed ?? 0,
          checks_total: result?.total ?? suite.checks.length,
          duration_ms: result?.duration ?? 0,
          failures: (result?.failures ?? []).join("; "),
        };
      }),
    [suites, results],
  );

  const hasRun = Object.values(results).some((r) => r.state !== "idle");

  return (
    <Card className="gap-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800 pb-4">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
            <ShieldCheck className="size-4 text-emerald-400" /> Deployment Check Matrix
          </h3>
          <p className="mt-0.5 text-xs text-zinc-400">
            Hits every endpoint this Worker serves and reports latency and status
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <ExportMenu rows={rows} filename="git-trace-test-matrix" disabled={!hasRun} />
          <Button onClick={() => void runAll()} disabled={running}>
            {running ? <RefreshCw className="animate-spin" /> : <Play className="fill-current" />}
            {running ? "Running Suite…" : "Execute All Suites"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {suites.map((suite) => {
          const result = results[suite.id];
          const state = result?.state ?? "idle";
          return (
            <div
              key={suite.id}
              className="space-y-3 rounded-xl border border-zinc-800/80 bg-zinc-950 p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-xs font-semibold text-zinc-200">{suite.name}</span>
                <StateBadge state={state} />
              </div>
              <p className="truncate font-mono text-[11px] text-zinc-500">{suite.target}</p>
              <div className="flex items-center justify-between border-t border-zinc-900 pt-2 font-mono text-[11px] text-zinc-400">
                <span>Checks</span>
                <span className="text-zinc-200">
                  {result ? `${result.passed}/${result.total}` : `0/${suite.checks.length}`}
                  {result && result.duration > 0 ? ` (${result.duration}ms)` : ""}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="space-y-2">
        <div className="text-xs font-semibold text-zinc-300">Terminal Execution Output</div>
        <div className="min-h-40 space-y-1.5 rounded-xl border border-zinc-800/90 bg-zinc-950 p-4 font-mono text-xs">
          {lines.length === 0 ? (
            <div className="text-zinc-500">Execute the suites to verify this deployment.</div>
          ) : (
            lines.map((line, index) => (
              <div
                key={`${index}-${line}`}
                className={cn(
                  line.startsWith("✓")
                    ? "text-emerald-400"
                    : line.startsWith("✗")
                      ? "text-rose-400"
                      : line.startsWith("🎉")
                        ? "font-bold text-indigo-400"
                        : line.startsWith("$")
                          ? "text-cyan-400"
                          : "text-zinc-400",
                )}
              >
                {line}
              </div>
            ))
          )}
        </div>
      </div>
    </Card>
  );
}

function StateBadge({ state }: { state: SuiteState }) {
  if (state === "running") {
    return (
      <Badge variant="info">
        <Loader2 className="animate-spin" /> RUNNING
      </Badge>
    );
  }
  if (state === "passed") {
    return (
      <Badge variant="success">
        <Check /> PASSED
      </Badge>
    );
  }
  if (state === "failed") {
    return (
      <Badge variant="destructive">
        <X /> FAILED
      </Badge>
    );
  }
  if (state === "skipped") return <Badge variant="warning">SKIPPED</Badge>;
  return <Badge variant="secondary">NOT RUN</Badge>;
}
