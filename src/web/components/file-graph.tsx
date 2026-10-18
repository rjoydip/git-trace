/**
 * Files as a knowledge graph: nodes are files sized by churn, edges are
 * co-change — two files a commit touched together, weighted by how often.
 *
 * ponytail: layout is a deterministic ring of directory clusters, not a force
 * simulation — same picture every render, no animation loop, no dependency. The
 * view transform (pan/zoom) is plain SVG maths on one `<g>`; a real simulation
 * or a graph library only pays off past a few hundred nodes.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { GitCompare, Maximize2, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { classifyPath, type PathKind } from "@/lib/paths";
import type { FileGraph as Graph } from "../../core/types";

const WIDTH = 900;
const HEIGHT = 520;
const CENTER = { x: WIDTH / 2, y: HEIGHT / 2 };
const ORBIT = 195;
const CLUSTER = 62;
const MIN_K = 0.3;
const MAX_K = 8;

const TONES: Record<PathKind, string> = {
  code: "var(--color-indigo-400)",
  docs: "var(--color-cyan-400)",
  config: "var(--color-amber-400)",
  other: "var(--color-zinc-500)",
};

const KINDS = ["code", "docs", "config", "other"] as const;

interface Placed {
  path: string;
  group: string;
  churn: number;
  commits: number;
  r: number;
  x: number;
  y: number;
}

export const GRAPH_VIEWBOX = { width: WIDTH, height: HEIGHT };

interface Neighbour {
  path: string;
  weight: number;
}

/** The view transform: see `translate(x y) scale(k)` on the root group. */
interface View {
  k: number;
  x: number;
  y: number;
}

const IDENTITY: View = { k: 1, x: 0, y: 0 };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Cluster centres sit on a ring, files on a smaller ring inside each. */
export function layout(graph: Graph): Placed[] {
  const groups = [...new Set(graph.nodes.map((n) => n.group))].sort();
  const maxChurn = Math.max(1, ...graph.nodes.map((n) => n.churn));
  const perGroup = new Map<string, number>();

  return graph.nodes.map((node) => {
    const groupIndex = groups.indexOf(node.group);
    const angle = (groupIndex / Math.max(1, groups.length)) * Math.PI * 2 - Math.PI / 2;
    const cx = CENTER.x + Math.cos(angle) * ORBIT;
    const cy = CENTER.y + Math.sin(angle) * ORBIT;

    const seat = perGroup.get(node.group) ?? 0;
    perGroup.set(node.group, seat + 1);
    const spread = seat * 0.9;
    const radius = node.group === "(root)" ? 0 : CLUSTER * Math.min(1, 0.35 + seat * 0.14);

    return {
      ...node,
      r: 3.5 + Math.sqrt(node.churn / maxChurn) * 9,
      x: cx + Math.cos(spread) * radius,
      y: cy + Math.sin(spread) * (radius * 0.75),
    };
  });
}

export function FileGraphView({
  graph,
  onTraceFile,
}: {
  graph: Graph;
  onTraceFile?: (path: string) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState<View>(IDENTITY);
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const drag = useRef<{ x: number; y: number; view: View } | null>(null);
  const moved = useRef(false);
  const pressedNode = useRef<string | null>(null);

  const { placed, byPath, neighbours, maxWeight, totalChurn } = useMemo(() => {
    const nodes = layout(graph);
    const adjacency = new Map<string, Neighbour[]>();
    for (const link of graph.links) {
      adjacency.set(link.source, [
        ...(adjacency.get(link.source) ?? []),
        { path: link.target, weight: link.weight },
      ]);
      adjacency.set(link.target, [
        ...(adjacency.get(link.target) ?? []),
        { path: link.source, weight: link.weight },
      ]);
    }
    for (const list of adjacency.values()) list.sort((a, b) => b.weight - a.weight);
    return {
      placed: nodes,
      byPath: new Map(nodes.map((n) => [n.path, n])),
      neighbours: adjacency,
      maxWeight: Math.max(1, ...graph.links.map((l) => l.weight)),
      totalChurn: nodes.reduce((sum, n) => sum + n.churn, 0),
    };
  }, [graph]);

  // A new trace is a new graph — reset the camera and the selection with it.
  useEffect(() => {
    setView(IDENTITY);
    setSelected(null);
  }, [graph]);

  /** Client coordinates → SVG user coordinates, whatever the view transform. */
  const toSvg = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return null;
    const point = svg.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    return point.matrixTransform(ctm.inverse());
  };

  // Zoom about the cursor. Registered natively because React's onWheel is
  // passive, so preventDefault (i.e. not scrolling the page) would be ignored.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (event: WheelEvent) => {
      const point = toSvg(event.clientX, event.clientY);
      if (!point) return;
      event.preventDefault();
      setView((current) => {
        const k = clamp(current.k * Math.exp(-event.deltaY * 0.0015), MIN_K, MAX_K);
        return {
          k,
          x: point.x - ((point.x - current.x) * k) / current.k,
          y: point.y - ((point.y - current.y) * k) / current.k,
        };
      });
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, []);

  const zoomBy = (factor: number) =>
    setView((current) => {
      const k = clamp(current.k * factor, MIN_K, MAX_K);
      return {
        k,
        x: CENTER.x - ((CENTER.x - current.x) * k) / current.k,
        y: CENTER.y - ((CENTER.y - current.y) * k) / current.k,
      };
    });

  const lit = useMemo(() => {
    const anchor = hovered ?? selected;
    if (!anchor) return null;
    const set = new Set([anchor]);
    for (const link of graph.links) {
      if (link.source === anchor) set.add(link.target);
      if (link.target === anchor) set.add(link.source);
    }
    return set;
  }, [graph.links, hovered, selected]);

  if (placed.length === 0) {
    return (
      <p className="py-10 text-center text-xs text-zinc-500">
        No file relationships in the recent window.
      </p>
    );
  }

  const node = selected ? byPath.get(selected) : undefined;
  const links = selected ? (neighbours.get(selected) ?? []) : [];

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_20rem]">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-mono text-[10px] text-zinc-500">
            Drag to pan · scroll or pinch to zoom · click a node for its details
          </span>
          <div className="flex items-center gap-1">
            <span className="mr-1 font-mono text-[10px] text-zinc-500">
              {Math.round(view.k * 100)}%
            </span>
            <Button
              variant="outline"
              size="icon"
              className="size-7"
              aria-label="Zoom out"
              onClick={() => zoomBy(1 / 1.3)}
            >
              <Minus className="size-3.5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-7"
              aria-label="Zoom in"
              onClick={() => zoomBy(1.3)}
            >
              <Plus className="size-3.5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-7"
              aria-label="Reset view"
              onClick={() => setView(IDENTITY)}
            >
              <Maximize2 className="size-3.5" />
            </Button>
          </div>
        </div>

        <svg
          ref={svgRef}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className={cn(
            "h-[380px] w-full touch-none rounded-xl border border-zinc-800/80 bg-zinc-950 sm:h-[440px]",
            drag.current ? "cursor-grabbing" : "cursor-grab",
          )}
          role="img"
          aria-label={`Co-change graph of ${placed.length} files`}
          onPointerDown={(event) => {
            drag.current = { x: event.clientX, y: event.clientY, view };
            moved.current = false;
            pressedNode.current =
              (event.target as Element).closest("[data-node]")?.getAttribute("data-node") ?? null;
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const start = drag.current;
            if (!start) return;
            const from = toSvg(start.x, start.y);
            const to = toSvg(event.clientX, event.clientY);
            if (!from || !to) return;
            if (Math.abs(event.clientX - start.x) + Math.abs(event.clientY - start.y) > 3) {
              moved.current = true;
            }
            setView({
              k: start.view.k,
              x: start.view.x + (to.x - from.x),
              y: start.view.y + (to.y - from.y),
            });
          }}
          onPointerUp={() => {
            drag.current = null;
            // A press that did not travel is a selection, not a pan.
            if (!moved.current) setSelected(pressedNode.current);
            pressedNode.current = null;
          }}
        >
          <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
            {graph.links.map((link) => {
              const a = byPath.get(link.source);
              const b = byPath.get(link.target);
              if (!a || !b) return null;
              const on = !lit || (lit.has(a.path) && lit.has(b.path));
              return (
                <line
                  key={`${link.source}→${link.target}`}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke="var(--color-indigo-400)"
                  strokeWidth={0.6 + (link.weight / maxWeight) * 2.6}
                  strokeOpacity={on ? 0.15 + (link.weight / maxWeight) * 0.45 : 0.04}
                />
              );
            })}

            {placed.map((node) => {
              const on = !lit || lit.has(node.path);
              return (
                <g
                  key={node.path}
                  data-node={node.path}
                  onMouseEnter={() => setHovered(node.path)}
                  onMouseLeave={() => setHovered(null)}
                  className="cursor-pointer"
                >
                  <title>{`${node.path}\n${node.commits} commit(s) · churn ${node.churn}`}</title>
                  {selected === node.path && (
                    <circle
                      data-node={node.path}
                      cx={node.x}
                      cy={node.y}
                      r={node.r + 4}
                      fill="none"
                      stroke="var(--color-cyan-400)"
                      strokeWidth={1.5}
                    />
                  )}
                  <circle
                    data-node={node.path}
                    cx={node.x}
                    cy={node.y}
                    r={node.r}
                    fill={TONES[classifyPath(node.path)]}
                    fillOpacity={on ? 0.85 : 0.2}
                    stroke="var(--color-zinc-950)"
                    strokeWidth={1.5}
                  />
                </g>
              );
            })}
          </g>
        </svg>

        <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[10px] text-zinc-500">
          <span>
            {placed.length} files · {graph.links.length} co-change links
          </span>
          <span className="flex flex-wrap items-center gap-3">
            {KINDS.map((kind) => (
              <span key={kind} className="flex items-center gap-1">
                <span className="size-2 rounded-full" style={{ backgroundColor: TONES[kind] }} />
                {kind}
              </span>
            ))}
          </span>
        </div>

        <p className="truncate rounded-lg border border-zinc-800/70 bg-zinc-900/40 px-3 py-2 font-mono text-[11px] text-zinc-500">
          {hovered ? `${hovered} — click for details` : "Hover a node to preview its path."}
        </p>
      </div>

      <aside className="rounded-xl border border-zinc-800/80 bg-zinc-950 p-4">
        {!node ? (
          <div className="space-y-2">
            <p className="text-xs text-zinc-400">No node selected.</p>
            <p className="text-[11px] leading-relaxed text-zinc-500">
              Click any file to read its churn, its directory cluster and the files it keeps
              changing alongside.
            </p>
            <p className="font-mono text-[11px] text-zinc-500">
              Largest: <span className="text-zinc-300">{placed[0]?.path}</span>
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <span className="font-mono text-[10px] tracking-wide text-zinc-500 uppercase">
                Selected file
              </span>
              <p className="font-mono text-xs leading-relaxed break-all text-zinc-100">
                {node.path}
              </p>
              <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10px]">
                <span
                  className="rounded-full px-2 py-0.5"
                  style={{
                    backgroundColor: `color-mix(in oklab, ${TONES[classifyPath(node.path)]} 18%, transparent)`,
                    color: TONES[classifyPath(node.path)],
                  }}
                >
                  {classifyPath(node.path)}
                </span>
                <span className="rounded-full border border-zinc-800 px-2 py-0.5 text-zinc-400">
                  cluster {node.group}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 border-t border-zinc-900 pt-3">
              {[
                ["Commits", String(node.commits)],
                ["Churn", String(node.churn)],
                ["Links", String(links.length)],
              ].map(([label, value]) => (
                <div key={label} className="space-y-0.5">
                  <div className="font-mono text-[9px] tracking-wide text-zinc-500 uppercase">
                    {label}
                  </div>
                  <div className="font-mono text-sm text-zinc-100">{value}</div>
                </div>
              ))}
            </div>

            <div className="space-y-1 border-t border-zinc-900 pt-3">
              <div className="flex items-center justify-between font-mono text-[10px] text-zinc-500">
                <span>Share of traced churn</span>
                <span className="text-zinc-300">
                  {totalChurn === 0 ? "0" : Math.round((node.churn / totalChurn) * 100)}%
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-zinc-900">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${totalChurn === 0 ? 0 : Math.max(2, (node.churn / totalChurn) * 100)}%`,
                    backgroundColor: TONES[classifyPath(node.path)],
                  }}
                />
              </div>
            </div>

            <div className="space-y-2 border-t border-zinc-900 pt-3">
              <span className="font-mono text-[10px] tracking-wide text-zinc-500 uppercase">
                Changed together with
              </span>
              {links.length === 0 ? (
                <p className="text-[11px] text-zinc-500">
                  No file shared a commit with this one in the window.
                </p>
              ) : (
                <ul className="max-h-52 space-y-1 overflow-y-auto pr-1">
                  {links.map((link) => (
                    <li key={link.path}>
                      <button
                        type="button"
                        onClick={() => setSelected(link.path)}
                        title="Select this file"
                        className="w-full space-y-1 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-zinc-900"
                      >
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="min-w-0 truncate font-mono text-[11px] text-zinc-300">
                            {link.path}
                          </span>
                          <span className="shrink-0 font-mono text-[10px] text-cyan-400">
                            {link.weight}×
                          </span>
                        </span>
                        <span className="block h-1 overflow-hidden rounded-full bg-zinc-900">
                          <span
                            className="block h-full rounded-full bg-cyan-500/70"
                            style={{ width: `${Math.max(4, (link.weight / maxWeight) * 100)}%` }}
                          />
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {onTraceFile && (
              <div className="flex flex-wrap gap-2 border-t border-zinc-900 pt-3">
                <Button variant="outline" size="xs" onClick={() => onTraceFile(node.path)}>
                  <GitCompare /> File history
                </Button>
                <Button variant="ghost" size="xs" onClick={() => setSelected(null)}>
                  Clear
                </Button>
              </div>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}
