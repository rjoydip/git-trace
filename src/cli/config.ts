/**
 * Version and the optional config file:
 * - config: `$XDG_CONFIG_HOME/git-trace/config.json`, else `~/.config/...`.
 *
 * Token resolution lives in `auth.ts`; a token never belongs in this file.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** What the config file can set today. A token does not belong in a plain file. */
export interface CliConfig {
  /** GitHub API base — point every command at a Worker or the emulator. */
  api?: string;
}

/** `$XDG_CONFIG_HOME/git-trace/config.json`, else `~/.config/git-trace/config.json`. */
export function configPath(env: NodeJS.ProcessEnv = process.env, home: string = homedir()): string {
  const base = env.XDG_CONFIG_HOME?.trim() || join(home, ".config");
  return join(base, "git-trace", "config.json");
}

/** Throws on a malformed file; the caller decides whether that is fatal. */
export function parseConfig(raw: string): CliConfig {
  const parsed = JSON.parse(raw) as unknown;
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("expected a JSON object");
  }
  const api = (parsed as { api?: unknown }).api;
  if (api === undefined) return {};
  if (typeof api !== "string" || api.trim() === "") {
    throw new Error(`"api" must be a non-empty string`);
  }
  return { api: api.trim() };
}

/** Absent is normal; malformed is reported once and ignored. */
export function readConfig(): CliConfig {
  const path = configPath();
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return {};
  }
  try {
    return parseConfig(raw);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`config: ${path}: ${message}\n`);
    return {};
  }
}

/** The package version — for `--version` and the MCP client handshake. */
export function packageVersion(): string {
  try {
    const path = new URL("../../package.json", import.meta.url);
    const parsed = JSON.parse(readFileSync(path, "utf8")) as { version?: string };
    return parsed.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}
