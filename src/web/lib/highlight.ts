/**
 * Syntax highlighting for file previews.
 *
 * `PrismLight` carries only the grammars registered here, so the bundle holds a
 * couple of dozen languages rather than Prism's full set. A path that maps to
 * none of them renders as plain text — an unknown language is a fallback, not a
 * failure.
 */
import { PrismLight } from "react-syntax-highlighter";
import bash from "react-syntax-highlighter/dist/esm/languages/prism/bash";
import c from "react-syntax-highlighter/dist/esm/languages/prism/c";
import cpp from "react-syntax-highlighter/dist/esm/languages/prism/cpp";
import css from "react-syntax-highlighter/dist/esm/languages/prism/css";
import diff from "react-syntax-highlighter/dist/esm/languages/prism/diff";
import go from "react-syntax-highlighter/dist/esm/languages/prism/go";
import graphql from "react-syntax-highlighter/dist/esm/languages/prism/graphql";
import ini from "react-syntax-highlighter/dist/esm/languages/prism/ini";
import java from "react-syntax-highlighter/dist/esm/languages/prism/java";
import javascript from "react-syntax-highlighter/dist/esm/languages/prism/javascript";
import json from "react-syntax-highlighter/dist/esm/languages/prism/json";
import jsx from "react-syntax-highlighter/dist/esm/languages/prism/jsx";
import kotlin from "react-syntax-highlighter/dist/esm/languages/prism/kotlin";
import markdown from "react-syntax-highlighter/dist/esm/languages/prism/markdown";
import markup from "react-syntax-highlighter/dist/esm/languages/prism/markup";
import php from "react-syntax-highlighter/dist/esm/languages/prism/php";
import python from "react-syntax-highlighter/dist/esm/languages/prism/python";
import ruby from "react-syntax-highlighter/dist/esm/languages/prism/ruby";
import rust from "react-syntax-highlighter/dist/esm/languages/prism/rust";
import scss from "react-syntax-highlighter/dist/esm/languages/prism/scss";
import sql from "react-syntax-highlighter/dist/esm/languages/prism/sql";
import swift from "react-syntax-highlighter/dist/esm/languages/prism/swift";
import toml from "react-syntax-highlighter/dist/esm/languages/prism/toml";
import tsx from "react-syntax-highlighter/dist/esm/languages/prism/tsx";
import typescript from "react-syntax-highlighter/dist/esm/languages/prism/typescript";
import yaml from "react-syntax-highlighter/dist/esm/languages/prism/yaml";
import oneDark from "react-syntax-highlighter/dist/esm/styles/prism/one-dark";
import oneLight from "react-syntax-highlighter/dist/esm/styles/prism/one-light";
import type { CSSProperties } from "react";
import { extensionOf } from "../../core/media";

type Grammar = (syntax: unknown) => void;

/** Every grammar in the bundle. Nothing else can be highlighted. */
const GRAMMARS: Record<string, Grammar> = {
  bash,
  c,
  cpp,
  css,
  diff,
  go,
  graphql,
  ini,
  java,
  javascript,
  json,
  jsx,
  kotlin,
  markdown,
  markup,
  php,
  python,
  ruby,
  rust,
  scss,
  sql,
  swift,
  toml,
  tsx,
  typescript,
  yaml,
};

for (const [name, grammar] of Object.entries(GRAMMARS)) {
  PrismLight.registerLanguage(name, grammar);
}

/** File extension → registered grammar name. */
const GRAMMAR_BY_EXTENSION: Record<string, string> = {
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  tsx: "tsx",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "jsx",
  json: "json",
  jsonc: "json",
  yml: "yaml",
  yaml: "yaml",
  toml: "toml",
  ini: "ini",
  cfg: "ini",
  conf: "ini",
  properties: "ini",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  py: "python",
  rb: "ruby",
  go: "go",
  rs: "rust",
  java: "java",
  kt: "kotlin",
  kts: "kotlin",
  swift: "swift",
  c: "c",
  h: "c",
  cc: "cpp",
  cpp: "cpp",
  cxx: "cpp",
  hpp: "cpp",
  php: "php",
  sql: "sql",
  css: "css",
  scss: "scss",
  sass: "scss",
  html: "markup",
  htm: "markup",
  xml: "markup",
  svg: "markup",
  vue: "markup",
  svelte: "markup",
  md: "markdown",
  mdx: "markdown",
  markdown: "markdown",
  graphql: "graphql",
  gql: "graphql",
  diff: "diff",
  patch: "diff",
};

/** The grammar for a path, or null when nothing registered covers it. */
export function languageFor(path: string): string | null {
  return GRAMMAR_BY_EXTENSION[extensionOf(path)] ?? null;
}

/** Prism styles, matched to the dashboard's two themes. */
export function prismStyle(mode: "dark" | "light"): Record<string, CSSProperties> {
  return (mode === "dark" ? oneDark : oneLight) as Record<string, CSSProperties>;
}

export { PrismLight };
