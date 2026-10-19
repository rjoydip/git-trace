/**
 * The Files tab's tree, shaped from GitHub's flat recursive listing. Kept out of
 * the component so the shaping is testable without a DOM.
 *
 * Directory-ness is derived from having children rather than stored: Git does
 * not track empty directories, so a node with children is a directory and one
 * without is a file — and the two can never disagree.
 */
export interface FileNode {
  name: string;
  /** The full path from the repository root — what selecting a row yields. */
  path: string;
  /** Bytes; 0 for directories. */
  size: number;
  children: FileNode[];
}

interface Draft {
  name: string;
  path: string;
  size: number;
  children: Map<string, Draft>;
}

/** Nests flat "a/b/c.ts" paths into directories-first, name-sorted nodes. */
export function buildTree(entries: Array<{ path: string; size?: number }>): FileNode[] {
  const root = new Map<string, Draft>();

  for (const entry of entries) {
    const path = entry.path.replace(/^\/+|\/+$/g, "");
    if (!path) continue;
    const segments = path.split("/");
    let level = root;
    let prefix = "";
    segments.forEach((name, index) => {
      prefix = prefix ? `${prefix}/${name}` : name;
      const last = index === segments.length - 1;
      let node = level.get(name);
      if (!node) {
        node = { name, path: prefix, size: last ? (entry.size ?? 0) : 0, children: new Map() };
        level.set(name, node);
      } else if (last) {
        node.size = entry.size ?? 0;
      }
      level = node.children;
    });
  }

  return finalize(root);
}

function finalize(level: Map<string, Draft>): FileNode[] {
  return [...level.values()]
    .map((draft) => ({
      name: draft.name,
      path: draft.path,
      size: draft.size,
      children: finalize(draft.children),
    }))
    .sort((a, b) => {
      const aDir = a.children.length > 0;
      const bDir = b.children.length > 0;
      if (aDir !== bDir) return aDir ? -1 : 1;
      // Numeric so "chapter-2" sorts before "chapter-10".
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
    });
}

/** Every file path in display order — the denominators for counts and defaults. */
export function flattenFiles(nodes: FileNode[]): string[] {
  const out: string[] = [];
  const walk = (list: FileNode[]): void => {
    for (const node of list) {
      if (node.children.length > 0) walk(node.children);
      else out.push(node.path);
    }
  };
  walk(nodes);
  return out;
}

/**
 * Every directory above a path, outermost first — what a tree has to expand so a
 * deep default file is visible when it first renders.
 */
export function ancestorsOf(path: string): string[] {
  const parts = path.split("/").slice(0, -1);
  return parts.map((_, index) => parts.slice(0, index + 1).join("/"));
}

/**
 * What the tab opens on: README.md. A root-level readme wins, then any readme,
 * then the first file in the tree — so a repository without one still opens on
 * something rather than an empty pane.
 */
export function defaultFilePath(files: string[]): string | null {
  const readme = /(^|\/)readme(\.[a-z0-9]+)?$/i;
  return (
    files.find((file) => !file.includes("/") && readme.test(file)) ??
    files.find((file) => readme.test(file)) ??
    files[0] ??
    null
  );
}
