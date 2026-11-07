/**
 * Generates `docs/cli.md` from the same option specs `--help` renders, so the
 * reference cannot drift from the CLI. Run with `bun run docs:cli`; the
 * `cli-docs` test fails if the committed file is stale.
 */
import { GLOBAL_OPTIONS, type OptionSpec } from "../src/cli/args";
import { COMMANDS } from "../src/cli/commands/index";

export function cliDocs(): string {
  const lines: string[] = [
    "# git-trace CLI",
    "",
    "A repository's history in a terminal: the numbers the dashboard shows,",
    "without a browser, a deployment, or (against `bun run emulate`) a token.",
    "",
    "## Install",
    "",
    "```sh",
    "bun install",
    "bun run build:cli       # dist/cli/index.js, the `git-trace` bin",
    "bun run cli --help      # or run it straight from source",
    "```",
    "",
    "## Usage",
    "",
    "```sh",
    "git-trace <command> <owner/name> [options]",
    "```",
    "",
    "Output is Markdown when piped — headings, GFM tables and bullets, ready for",
    "a prompt or an issue — and the rendered view on a terminal: bold headings,",
    "aligned tables, colour. `--md` and `--text` override either way.",
    "",
    "Defaults may come from `~/.config/git-trace/config.json` — `api` only; flags",
    "and the environment win over it.",
    "",
    "## Global options",
    "",
    ...optionTable(GLOBAL_OPTIONS),
    "",
    "## Commands",
    "",
  ];

  for (const command of COMMANDS) {
    lines.push(`### \`git-trace ${command.name}\``, "", command.summary, "", "```sh");
    lines.push(command.usage, "```", "");
    const own = Object.entries(command.options);
    lines.push(
      ...(own.length > 0 ? optionTable(command.options) : ["Takes no options of its own."]),
      "",
    );
  }

  lines.push(
    "## Exit codes",
    "",
    "| Code | Meaning |",
    "| --- | --- |",
    "| `0` | Success |",
    "| `1` | GitHub or runtime error; message on stderr |",
    "| `2` | Usage error: unknown command, bad flag, missing argument |",
    "",
    "## Related",
    "",
    "- [`docs/api.md`](./api.md) — the HTTP JSON API behind every command",
    "- [`docs/mcp.md`](./mcp.md) — MCP tools, resource and prompt",
    "",
  );

  return lines.join("\n");
}

function optionTable(options: Record<string, OptionSpec>): string[] {
  const rows = Object.entries(options).map(([name, spec]) => [
    `\`${flag(name, spec).replace(/\|/g, "\\|")}\``,
    spec.description.replace(/\|/g, "\\|"),
  ]);
  return [
    "| Flag | Meaning |",
    "| --- | --- |",
    ...rows.map(([flag, description]) => `| ${flag} | ${description} |`),
  ];
}

function flag(name: string, spec: OptionSpec): string {
  const short = spec.short ? `-${spec.short}, ` : "";
  return `${short}--${name}${spec.value ? ` ${spec.value}` : ""}`;
}

if (import.meta.main) {
  const target = new URL("../docs/cli.md", import.meta.url);
  await Bun.write(target, cliDocs());
  console.log(`wrote docs/cli.md (${COMMANDS.length} commands)`);
}
