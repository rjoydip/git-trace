/** Coarse bucket for a repository file path, used by the hot-files filter. */
export type PathKind = "code" | "docs" | "config" | "other";

const CONFIG_NAMES = new Set([
  "dockerfile",
  "makefile",
  ".gitignore",
  ".editorconfig",
  ".npmrc",
  ".nvmrc",
  "license",
]);

const CONFIG_EXT = new Set(["json", "jsonc", "yml", "yaml", "toml", "ini", "lock", "env"]);
const DOC_EXT = new Set(["md", "mdx", "txt", "rst", "adoc"]);
const CODE_EXT = new Set([
  "ts",
  "tsx",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "py",
  "rb",
  "go",
  "rs",
  "java",
  "kt",
  "kts",
  "c",
  "h",
  "cc",
  "cpp",
  "hpp",
  "cs",
  "php",
  "swift",
  "scala",
  "sh",
  "bash",
  "zsh",
  "sql",
  "css",
  "scss",
  "sass",
  "less",
  "html",
  "vue",
  "svelte",
  "astro",
  "graphql",
  "proto",
]);

export function classifyPath(path: string): PathKind {
  const name = path.slice(path.lastIndexOf("/") + 1).toLowerCase();
  if (CONFIG_NAMES.has(name)) return "config";
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return "other";
  const ext = name.slice(dot + 1);
  if (DOC_EXT.has(ext)) return "docs";
  if (CONFIG_EXT.has(ext)) return "config";
  if (CODE_EXT.has(ext)) return "code";
  return "other";
}
