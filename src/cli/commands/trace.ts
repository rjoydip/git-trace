import { numberFlag, repoOf, type Command } from "../args";
import { renderTrace, write, writeJson } from "../render";

export const trace: Command = {
  name: "trace",
  summary: "Overview: metadata, headline metrics, top contributors and hot files",
  usage: "git-trace trace <owner/name> [--limit <n>] [--json]",
  options: {
    limit: {
      type: "string",
      short: "n",
      value: "<n>",
      description: "Commits to sample (default 100, max 100)",
    },
  },

  async run({ service, values, positionals, colour, markdown }) {
    const repo = repoOf(values, positionals);
    const limit = numberFlag(values, "limit", { min: 1, max: 100 });
    const payload = await service.trace(repo, limit === undefined ? {} : { commitLimit: limit });

    if (values.json) writeJson(payload);
    else write(renderTrace(payload, { colour, markdown }));
  },
};
