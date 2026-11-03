#!/usr/bin/env node
/**
 * `git-trace` — the dashboard's answers, in a terminal.
 *
 * A third adapter over `TraceService` (the dashboard and MCP are the others):
 * it runs in-process, so it needs no Worker, works against `bun run emulate`,
 * and cannot disagree with the web app's numbers.
 */
import { TraceService } from "../core/service";
import { GitHubError } from "../core/github";
import { assertCommandOptions, parseCli, stringValue, UsageError, usageText } from "./args";
import { logRequests } from "./log";
import { packageVersion, readConfig } from "./config";
import { detectAuth, loginHint, type AuthState } from "./auth";
import { COMMANDS } from "./commands";

async function main(argv: string[]): Promise<number> {
  let parsed;
  try {
    parsed = parseCli(argv, COMMANDS);
  } catch (err) {
    return usageFailure(err);
  }
  const { values, positionals } = parsed;

  if (values.version) {
    process.stdout.write(`${packageVersion()}\n`);
    return 0;
  }

  // `git-trace`, `git-trace --help`, `git-trace help`, `git-trace help trace`
  // and `git-trace trace --help` all mean "show usage for something".
  const asksForHelp = values.help === true || positionals[0] === "help" || positionals.length === 0;
  if (asksForHelp) {
    const topic = positionals[0] === "help" ? positionals[1] : positionals[0];
    try {
      process.stdout.write(`${usageText(COMMANDS, topic)}\n`);
      return 0;
    } catch (err) {
      return usageFailure(err);
    }
  }

  const name = positionals[0]!;
  const command = COMMANDS.find((candidate) => candidate.name === name);
  if (!command) return usageFailure(new UsageError(`No such command: ${name}`));

  try {
    assertCommandOptions(values, command);
  } catch (err) {
    return usageFailure(err);
  }

  // Before the service exists, so the first GitHub request is already logged.
  if (values.verbose === true) logRequests();

  let markdown: boolean;
  try {
    markdown = resolveMarkdown(values);
  } catch (err) {
    return usageFailure(err);
  }

  const config = readConfig();
  const auth = detectAuth(stringValue(values.token));
  const token = auth.token;
  // Flags beat the environment, which beats the config file.
  const api = stringValue(values.api) ?? process.env.GITHUB_API_URL ?? config.api;
  const service = new TraceService({
    ...(token ? { token } : {}),
    ...(api ? { baseUrl: api } : {}),
    // No edge cache outside a Worker; one run is one run.
    cacheTtlSeconds: 0,
  });

  try {
    const code = await command.run({
      service,
      values,
      positionals: positionals.slice(1),
      colour: resolveColour(values),
      markdown,
      auth,
      ...(token ? { token } : {}),
      api: api ?? "https://api.github.com",
    });
    return code ?? 0;
  } catch (err) {
    if (err instanceof UsageError) return usageFailure(err);
    if (err instanceof GitHubError) return authFailure(err, auth);
    throw err;
  }
}

/**
 * The GitHub client's rate-limit hint is written for the dashboard ("Settings").
 * The CLI's action is `login`, so it names that instead — and says whether `gh`
 * is installed, since the fix differs.
 */
function authFailure(err: GitHubError, auth: AuthState): number {
  const lines = [err.message];
  if (err.status === 401) {
    lines.push(
      auth.token
        ? "GitHub rejected that token — run `git-trace login`, or pass a new --token."
        : loginHint(auth),
    );
  } else if ((err.status === 403 || err.status === 429) && /rate limit/i.test(err.message)) {
    lines.push(
      auth.token
        ? "This token's quota is exhausted — wait for the reset, or use another token."
        : loginHint(auth),
    );
  } else if (err.status === 403 && auth.token) {
    lines.push("The token may lack permission for this repository.");
  }
  process.stderr.write(`${lines.join("\n")}\n`);
  return 1;
}

/**
 * A terminal cannot render Markdown — it would show `**` and pipes raw — so a
 * TTY gets the rendered view: bold headings, aligned tables, colour. A pipe or
 * a file gets Markdown, which is what an agent wants to paste into a prompt.
 * `--md` and `--text` override either way.
 */
function resolveMarkdown(values: Record<string, string | boolean | undefined>): boolean {
  if (values.md === true && values.text === true) {
    throw new UsageError("--md and --text are mutually exclusive");
  }
  if (values.md === true) return true;
  if (values.text === true) return false;
  return !process.stdout.isTTY;
}

function resolveColour(values: Record<string, string | boolean | undefined>): boolean {
  if (values["no-color"] === true) return false;
  if (values.color === true) return true;
  if (process.env.NO_COLOR !== undefined) return false;
  return Boolean(process.stdout.isTTY);
}

function usageFailure(err: unknown): number {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`${message}\n\nRun \`git-trace --help\` for usage.\n`);
  return 2;
}

main(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err: unknown) => {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  });
