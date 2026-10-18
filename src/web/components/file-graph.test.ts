import { describe, expect, test } from "bun:test";
import { GRAPH_VIEWBOX, layout } from "./file-graph";
import type { FileGraph, FileNode } from "../../core/types";

function node(path: string, churn: number): FileNode {
  const cut = path.indexOf("/");
  return { path, group: cut === -1 ? "(root)" : path.slice(0, cut), commits: 1, churn };
}

/** `count` files spread over `dirs` top-level directories. */
function graph(count: number, dirs: number): FileGraph {
  const nodes = Array.from({ length: count }, (_, i) =>
    node(dirs === 0 ? `file-${i}.ts` : `dir${i % dirs}/file-${i}.ts`, 4 + (i % 30)),
  );
  return { nodes, links: [] };
}

describe("layout", () => {
  test("is deterministic and preserves the node's own data", () => {
    const input = graph(24, 4);
    const first = layout(input);
    expect(layout(input)).toEqual(first);
    expect(first.map((n) => n.path)).toEqual(input.nodes.map((n) => n.path));
  });

  test("keeps every node inside the viewBox, root files included", () => {
    for (const input of [graph(40, 1), graph(40, 8), graph(12, 0), graph(1, 3)]) {
      for (const placed of layout(input)) {
        expect(Number.isFinite(placed.x)).toBe(true);
        expect(Number.isFinite(placed.y)).toBe(true);
        expect(placed.x - placed.r).toBeGreaterThan(0);
        expect(placed.x + placed.r).toBeLessThan(GRAPH_VIEWBOX.width);
        expect(placed.y - placed.r).toBeGreaterThan(0);
        expect(placed.y + placed.r).toBeLessThan(GRAPH_VIEWBOX.height);
      }
    }
  });

  test("sizes the radius by churn, smallest still visible", () => {
    const [big, small] = layout({ nodes: [node("a/x.ts", 400), node("a/y.ts", 1)], links: [] });
    expect(big!.r).toBeGreaterThan(small!.r);
    expect(small!.r).toBeGreaterThanOrEqual(3.5);
  });
});
