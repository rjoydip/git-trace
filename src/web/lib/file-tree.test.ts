import { describe, expect, test } from "bun:test";
import { buildTree, defaultFilePath, flattenFiles, ancestorsOf, type FileNode } from "./file-tree";

const ENTRIES = [
  { path: "README.md", size: 1200 },
  { path: "package.json", size: 400 },
  { path: "src/index.ts", size: 90 },
  { path: "src/web/App.tsx", size: 300 },
  { path: "src/web/lib/file-tree.ts", size: 100 },
  { path: "docs/chapter-10.md", size: 10 },
  { path: "docs/chapter-2.md", size: 20 },
  { path: "docs/readme.md", size: 5 },
];

const seek = (nodes: FileNode[], path: string): FileNode | undefined => {
  for (const node of nodes) {
    if (node.path === path) return node;
    const hit = seek(node.children, path);
    if (hit) return hit;
  }
  return undefined;
};

const at = (nodes: FileNode[], path: string): FileNode => {
  const node = seek(nodes, path);
  if (!node) throw new Error(`no node at ${path}`);
  return node;
};

const names = (nodes: FileNode[]): string[] => nodes.map((node) => node.name);

describe("buildTree", () => {
  test("nests flat paths, directories first", () => {
    // Case-insensitive, so package.json precedes README.md.
    expect(names(buildTree(ENTRIES))).toEqual(["docs", "src", "package.json", "README.md"]);
  });

  test("a directory is a node with children and carries no size", () => {
    const src = at(buildTree(ENTRIES), "src");
    expect(src.children.length).toBeGreaterThan(0);
    expect(src.size).toBe(0);
  });

  test("a file is a leaf that keeps its size", () => {
    expect(at(buildTree(ENTRIES), "README.md").children).toEqual([]);
    expect(at(buildTree(ENTRIES), "README.md").size).toBe(1200);
  });

  test("every node carries the path from the repository root", () => {
    expect(at(buildTree(ENTRIES), "src/web/App.tsx").path).toBe("src/web/App.tsx");
    expect(at(buildTree(ENTRIES), "src/web").path).toBe("src/web");
  });

  test("sorts names numerically, so chapter-2 precedes chapter-10", () => {
    expect(names(at(buildTree(ENTRIES), "docs").children)).toEqual([
      "chapter-2.md",
      "chapter-10.md",
      "readme.md",
    ]);
  });

  test("puts a directory before a file at every level", () => {
    expect(names(at(buildTree(ENTRIES), "src").children)).toEqual(["web", "index.ts"]);
    expect(names(at(buildTree(ENTRIES), "src/web").children)).toEqual(["lib", "App.tsx"]);
  });

  test("ignores blank paths and de-duplicates repeats", () => {
    expect(buildTree([{ path: "" }, { path: "/" }])).toEqual([]);
    const twice = buildTree([
      { path: "a.ts", size: 1 },
      { path: "a.ts", size: 9 },
    ]);
    expect(flattenFiles(twice)).toEqual(["a.ts"]);
    expect(twice[0]!.size).toBe(9);
  });

  test("an empty listing is an empty tree", () => {
    expect(buildTree([])).toEqual([]);
  });
});

describe("flattenFiles", () => {
  test("lists every file in display order, directories expanded in place", () => {
    expect(flattenFiles(buildTree(ENTRIES))).toEqual([
      "docs/chapter-2.md",
      "docs/chapter-10.md",
      "docs/readme.md",
      "src/web/lib/file-tree.ts",
      "src/web/App.tsx",
      "src/index.ts",
      "package.json",
      "README.md",
    ]);
  });

  test("counts every file and no directories", () => {
    expect(flattenFiles(buildTree(ENTRIES))).toHaveLength(ENTRIES.length);
  });
});

describe("defaultFilePath", () => {
  test("opens on a root README.md", () => {
    expect(defaultFilePath(flattenFiles(buildTree(ENTRIES)))).toBe("README.md");
    expect(defaultFilePath(["src/a.ts", "docs/readme.md", "README.md"])).toBe("README.md");
  });

  test("accepts a readme with any extension or none, case-insensitively", () => {
    expect(defaultFilePath(["a.txt", "ReadMe.rst"])).toBe("ReadMe.rst");
    expect(defaultFilePath(["a.txt", "README"])).toBe("README");
    expect(defaultFilePath(["a.txt", "docs/README.markdown"])).toBe("docs/README.markdown");
  });

  test("prefers a nested readme over an unrelated root file", () => {
    expect(defaultFilePath(["src/a.ts", "docs/readme.md"])).toBe("docs/readme.md");
  });

  test("falls back to the first file when there is no readme", () => {
    expect(defaultFilePath(["b.ts", "a.ts"])).toBe("b.ts");
    expect(defaultFilePath([])).toBeNull();
  });

  test("does not mistake a readme-prefixed name for a readme", () => {
    expect(defaultFilePath(["a.ts", "src/readme-utils.ts"])).toBe("a.ts");
    expect(defaultFilePath(["a.ts", "readme.md.bak"])).toBe("a.ts");
  });
});

describe("ancestorsOf", () => {
  test("lists every directory above a file, outermost first", () => {
    expect(ancestorsOf("src/web/components/files.tsx")).toEqual([
      "src",
      "src/web",
      "src/web/components",
    ]);
  });

  test("a root file has no ancestors", () => {
    expect(ancestorsOf("README.md")).toEqual([]);
  });

  test("a top-level directory holds its files directly", () => {
    expect(ancestorsOf("src/index.ts")).toEqual(["src"]);
  });
});
