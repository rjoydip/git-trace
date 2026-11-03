/**
 * `git-trace prompt` — the dashboard's "Copy LLM Context Prompt", on stdout, so
 * `git-trace prompt owner/name | pbcopy` does the same thing in one step.
 */
import { buildContextPrompt } from "../../core/prompt";
import { repoOf, type Command } from "../args";
import { write, writeJson } from "../render";

const UNCAPPED = {
  hotFiles: Number.POSITIVE_INFINITY,
  contributors: Number.POSITIVE_INFINITY,
  commits: Number.POSITIVE_INFINITY,
};

export const prompt: Command = {
  name: "prompt",
  summary: "Zero-token context digest of the repository's history",
  usage: "git-trace prompt <owner/name> [--full]",
  options: {
    full: { type: "boolean", description: "Every contributor, hot file and commit" },
  },

  async run({ service, values, positionals }) {
    const payload = await service.trace(repoOf(values, positionals));

    if (values.json) {
      writeJson(payload);
      return;
    }
    write(buildContextPrompt(payload, values.full === true ? UNCAPPED : {}));
  },
};
