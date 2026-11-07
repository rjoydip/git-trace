/**
 * The ranking commands — the Contributors, Hot Files and activity views.
 */
import { numberFlag, repoOf, stringValue, type Command } from "../args";
import {
  palette,
  renderActivity,
  renderContributors,
  renderHotFiles,
  write,
  writeJson,
} from "../render";
import { watch as watchLoop } from "../watch";

export const contributors: Command = {
  name: "contributors",
  summary: "Authors ranked by commit count",
  usage: "git-trace contributors <owner/name> [--limit <n>]",
  options: {
    limit: { type: "string", short: "n", value: "<n>", description: "Rows (default 20, max 100)" },
  },

  async run({ service, values, positionals, colour, markdown }) {
    const repo = repoOf(values, positionals);
    const limit = numberFlag(values, "limit", { min: 1, max: 100 }) ?? 20;
    const rollups = (await service.contributors(repo)).slice(0, limit);

    if (values.json) writeJson(rollups);
    else write(renderContributors(rollups, { colour, markdown }));
  },
};

export const hotFiles: Command = {
  name: "hot-files",
  summary: "Files ranked by churn over the sampled commits",
  usage: "git-trace hot-files <owner/name> [--limit <n>]",
  options: {
    limit: { type: "string", short: "n", value: "<n>", description: "Rows (default 10, max 100)" },
  },

  async run({ service, values, positionals, colour, markdown }) {
    const repo = repoOf(values, positionals);
    const limit = numberFlag(values, "limit", { min: 1, max: 100 }) ?? 10;
    const files = await service.hotFiles(repo, { limit });

    if (values.json) writeJson(files);
    else write(renderHotFiles(files, { colour, markdown }));
  },
};

export const activity: Command = {
  name: "activity",
  summary: "Commits per day, as a table or a bar chart",
  usage:
    "git-trace activity <owner/name> [--days <n>] [--since <date>] [--until <date>] [--bar] [--watch]",
  options: {
    days: {
      type: "string",
      short: "d",
      value: "<n>",
      description: "Window ending today (default 30; --since wins)",
    },
    since: { type: "string", value: "<date>", description: "ISO date or YYYY-MM-DD" },
    until: { type: "string", value: "<date>", description: "ISO date or YYYY-MM-DD" },
    bar: { type: "boolean", description: "Draw a bar per day instead of a table" },
    watch: { type: "boolean", description: "Poll and redraw until Ctrl+C" },
    interval: {
      type: "string",
      value: "<seconds>",
      description: "Watch interval (default 15, min 5)",
    },
  },

  async run({ service, values, positionals, colour, markdown }) {
    const repo = repoOf(values, positionals);
    const days = numberFlag(values, "days", { min: 1, max: 3_650 }) ?? 30;
    const since =
      stringValue(values.since) ?? new Date(Date.now() - days * 86_400_000).toISOString();
    const until = stringValue(values.until);
    const watch = values.watch === true;
    const interval = (numberFlag(values, "interval", { min: 5, max: 3_600 }) ?? 15) * 1_000;

    const read = () => service.activity(repo, until ? { since, until } : { since });
    const { dim } = palette(colour, markdown);

    const frame = async (first: boolean): Promise<void> => {
      const buckets = await read();
      if (values.json) {
        // Watching is a stream, so a tick is one compact line (NDJSON).
        write(watch ? JSON.stringify(buckets) : JSON.stringify(buckets, null, 2));
        return;
      }
      if (watch) {
        if (!first && process.stdout.isTTY) process.stdout.write("\x1b[2J\x1b[H");
        const at = new Date().toISOString().slice(11, 19);
        write(dim(`updated ${at}Z · every ${interval / 1_000}s · Ctrl+C to stop`));
        write("");
      }
      write(renderActivity(buckets, { colour, markdown, bar: values.bar === true }));
    };

    // The first frame is not retried: a typo in the repository should fail now,
    // not scroll forever. Later ticks survive a transient GitHub error.
    await frame(true);
    if (!watch) return 0;

    const controller = new AbortController();
    const stop = (): void => controller.abort();
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);

    await watchLoop(
      interval,
      async () => {
        try {
          await frame(false);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          process.stderr.write(`activity: ${message}\n`);
        }
      },
      controller.signal,
    );
    return 0;
  },
};
