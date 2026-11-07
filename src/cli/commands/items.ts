/**
 * Pull requests and issues — the list, and one item with its timeline.
 */
import { choiceFlag, numberFlag, repoOf, UsageError, type Command } from "../args";
import { renderItems, renderTrack, write, writeJson } from "../render";

export const items: Command = {
  name: "items",
  summary: "Pull requests and issues, newest activity first",
  usage: "git-trace items <owner/name> [--state open|closed|all] [--kind pull|issue]",
  options: {
    state: { type: "string", value: "<open|closed|all>", description: "Default open" },
    kind: { type: "string", value: "<pull|issue>", description: "Default both" },
    limit: { type: "string", short: "n", value: "<n>", description: "Rows (default 50, max 100)" },
  },

  async run({ service, values, positionals, colour, markdown }) {
    const repo = repoOf(values, positionals);
    const state = choiceFlag(values, "state", ["open", "closed", "all"] as const, "open");
    const kind = choiceFlag(values, "kind", ["pull", "issue", "all"] as const, "all");
    const limit = numberFlag(values, "limit", { min: 1, max: 100 }) ?? 50;

    const listed = await service.items(repo, { state, limit });
    const rows = kind === "all" ? listed : listed.filter((item) => item.kind === kind);

    if (values.json) writeJson(rows);
    else write(renderItems(rows, { colour, markdown }));
  },
};

export const track: Command = {
  name: "track",
  summary: "One pull request or issue: state, numbers and timeline",
  usage: "git-trace track <owner/name> <number> [--kind pull|issue]",
  options: {
    kind: { type: "string", value: "<pull|issue>", description: "Default pull" },
    limit: {
      type: "string",
      short: "n",
      value: "<n>",
      description: "Commits, reviews and comments to fetch (default 20)",
    },
  },

  async run({ service, values, positionals, colour, markdown }) {
    const repo = repoOf(values, positionals);
    const raw = positionals[1];
    if (!raw) throw new UsageError("An item is required: git-trace track <owner/name> <number>");
    const number = Number(raw);
    if (!Number.isInteger(number) || number <= 0) {
      throw new UsageError(`Not a pull request or issue number: "${raw}"`);
    }
    const kind = choiceFlag(values, "kind", ["pull", "issue"] as const, "pull");
    const limit = numberFlag(values, "limit", { min: 1, max: 100 }) ?? 20;

    const item = await service.track(repo, { number, kind, limit });

    if (values.json) writeJson(item);
    else write(renderTrack(item, { colour, markdown }));
  },
};
