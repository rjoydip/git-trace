/**
 * The command registry. Kept out of `index.ts` so the docs generator can import
 * it without running the CLI.
 */
import type { Command } from "../args";
import { commit, comments, commits } from "./commits";
import { docs } from "./docs";
import { doctor } from "./doctor";
import { fileHistory, refs, tag, tree } from "./files";
import { items, track } from "./items";
import { login } from "./login";
import { mcp } from "./mcp";
import { prompt } from "./prompt";
import { activity, contributors, hotFiles } from "./stats";
import { trace } from "./trace";

/** Help order: the overview, then by theme, then the non-repository commands. */
export const COMMANDS: readonly Command[] = [
  trace,
  commits,
  commit,
  comments,
  contributors,
  hotFiles,
  activity,
  items,
  track,
  tree,
  refs,
  tag,
  fileHistory,
  prompt,
  mcp,
  doctor,
  login,
  docs,
];
