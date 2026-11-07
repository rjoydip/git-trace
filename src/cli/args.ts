/**
 * The CLI's option surface. `--help` is rendered from these specs, and P3 will
 * generate `docs/cli.md` from the same table, so the two cannot drift.
 */
import { parseArgs } from "node:util";
import type { TraceService } from "../core/service";
import type { AuthState } from "./auth";

/** A rejected invocation — a missing repository, a bad flag value. Exit code 2. */
export class UsageError extends Error {}

export interface OptionSpec {
  type: "string" | "boolean";
  /** Single-letter alias, without the dash. */
  short?: string;
  /** Value placeholder for the help line, e.g. `<n>`. */
  value?: string;
  description: string;
}

export interface Command {
  name: string;
  summary: string;
  usage: string;
  /** Options this command adds to the global set. */
  options: Record<string, OptionSpec>;
  /** Resolves to an exit code when the command has one (e.g. `doctor`). */
  run: (ctx: RunContext) => Promise<number | void>;
}

export interface RunContext {
  service: TraceService;
  /** Parsed flags. `--json`, `--no-color` and friends live here too. */
  values: Record<string, string | boolean | undefined>;
  /** Arguments after the command name. */
  positionals: string[];
  colour: boolean;
  /** Markdown instead of aligned text: piped output, or `--md`. */
  markdown: boolean;
  /** The token actually in use, if any — never printed in full. */
  token?: string;
  /** Where that token came from, and whether `gh` is available to log in. */
  auth: AuthState;
  /** The resolved GitHub API base, for `doctor` and `docs`. */
  api: string;
}

/** Options every command understands. */
export const GLOBAL_OPTIONS: Record<string, OptionSpec> = {
  repo: {
    type: "string",
    short: "r",
    value: "<owner/name>",
    description: "Repository, when it is not the first positional",
  },
  token: {
    type: "string",
    value: "<token>",
    description: "GitHub token (else GITHUB_TOKEN, GH_TOKEN, `gh auth token`)",
  },
  api: {
    type: "string",
    value: "<url>",
    description: "GitHub API base (else GITHUB_API_URL, then api.github.com)",
  },
  json: { type: "boolean", description: "Print the raw payload instead of a report" },
  md: { type: "boolean", description: "Markdown even on a terminal (implied when piped)" },
  text: { type: "boolean", description: "Aligned text, even when piped" },
  color: { type: "boolean", description: "Force colour" },
  "no-color": { type: "boolean", description: "Disable colour" },
  verbose: {
    type: "boolean",
    short: "v",
    description: "Log GitHub requests to stderr",
  },
  help: { type: "boolean", short: "h", description: "Show help for the command" },
  version: { type: "boolean", short: "V", description: "Show the version" },
};

export interface ParsedArgs {
  values: Record<string, string | boolean | undefined>;
  positionals: string[];
}

/**
 * One parse for every command's flags, then `assertCommandOptions` rejects the
 * ones that do not belong to the command that was actually asked for.
 */
export function parseCli(argv: string[], commands: readonly Command[]): ParsedArgs {
  const options: Record<string, { type: "string" | "boolean"; short?: string }> = {};
  for (const [name, spec] of Object.entries(allOptions(commands))) {
    options[name] = spec.short ? { type: spec.type, short: spec.short } : { type: spec.type };
  }
  const parsed = parseArgs({ args: argv, options, allowPositionals: true, strict: true });
  return { values: parsed.values as ParsedArgs["values"], positionals: parsed.positionals };
}

export function assertCommandOptions(values: ParsedArgs["values"], command: Command): void {
  const allowed = new Set([...Object.keys(GLOBAL_OPTIONS), ...Object.keys(command.options)]);
  const wrong = Object.keys(values).filter((name) => !allowed.has(name));
  if (wrong.length > 0) {
    throw new UsageError(`${command.name} does not take --${wrong.join(", --")}`);
  }
}

function allOptions(commands: readonly Command[]): Record<string, OptionSpec> {
  const all: Record<string, OptionSpec> = { ...GLOBAL_OPTIONS };
  for (const command of commands) Object.assign(all, command.options);
  return all;
}

/** `git-trace --help`, or `git-trace help <command>`. */
export function usageText(commands: readonly Command[], topic?: string): string {
  const lines: string[] = [];
  if (topic) {
    const command = commands.find((c) => c.name === topic);
    if (!command) throw new UsageError(`No such command: ${topic}`);
    lines.push(`${command.usage}`, "", command.summary, "", "Options:");
    lines.push(...optionLines({ ...GLOBAL_OPTIONS, ...command.options }));
    return lines.join("\n");
  }

  lines.push(
    "git-trace — trace a repository's history",
    "",
    "Usage:",
    "  git-trace <command> <repo> [options]",
    "",
    "Commands:",
  );
  const width = Math.max(...commands.map((c) => c.name.length));
  for (const command of commands) {
    lines.push(`  ${command.name.padEnd(width)}  ${command.summary}`);
  }
  lines.push("", "Run `git-trace help <command>` for its options.", "", "Options:");
  lines.push(...optionLines(GLOBAL_OPTIONS));
  return lines.join("\n");
}

function optionLines(options: Record<string, OptionSpec>): string[] {
  const rows = Object.entries(options).map(([name, spec]) => ({
    flag: `${spec.short ? `-${spec.short}, ` : "    "}--${name}${spec.value ? ` ${spec.value}` : ""}`,
    description: spec.description,
  }));
  const width = Math.max(...rows.map((row) => row.flag.length));
  return rows.map((row) => `  ${row.flag.padEnd(width)}  ${row.description}`);
}

/** A flag's value, ignoring booleans. */
export function stringValue(value: string | boolean | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** The repository argument: first positional, or `--repo`. */
export function repoOf(values: ParsedArgs["values"], positionals: readonly string[]): string {
  const repo = positionals[0] ?? stringValue(values.repo);
  if (!repo) {
    throw new UsageError("A repository is required: git-trace <command> <owner/name>");
  }
  return repo;
}

/** A `--flag <n>` integer, validated before it reaches the service. */
export function numberFlag(
  values: ParsedArgs["values"],
  name: string,
  bounds: { min: number; max: number },
): number | undefined {
  const raw = values[name];
  if (raw === undefined) return undefined;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < bounds.min || parsed > bounds.max) {
    throw new UsageError(`--${name} must be an integer between ${bounds.min} and ${bounds.max}`);
  }
  return parsed;
}

/** A flag whose value has to be one of a fixed set, with a default. */
export function choiceFlag<T extends string>(
  values: ParsedArgs["values"],
  name: string,
  choices: readonly T[],
  fallback: T,
): T {
  const raw = stringValue(values[name]);
  if (raw === undefined) return fallback;
  if (!(choices as readonly string[]).includes(raw)) {
    throw new UsageError(`--${name} must be one of: ${choices.join(", ")}`);
  }
  return raw as T;
}
