/**
 * The Tests tab, for one machine: probe the same read paths the dashboard uses
 * and report what answered, how fast, and what broke. Exits 1 if anything
 * failed, so CI can use it.
 */
import { repoOf, type Command } from "../args";
import { formatTable, palette, write, writeJson } from "../render";

interface Check {
  name: string;
  ok: boolean;
  ms: number;
  detail: string;
}

export const doctor: Command = {
  name: "doctor",
  summary: "Probe the read paths the dashboard uses",
  usage: "git-trace doctor <owner/name>",
  options: {},

  async run({ service, values, positionals, colour, markdown, token, auth, api }) {
    const repo = repoOf(values, positionals);

    const checks: Array<[string, () => Promise<string>]> = [
      [
        "token",
        async () => {
          if (token) return `set (${auth.source ?? "token"})`;
          if (auth.gh === "unauthenticated")
            return "anonymous · gh not signed in (`git-trace login`)";
          if (auth.gh === "missing") return "anonymous · no gh (`git-trace login` for a URL)";
          return "anonymous (60 requests/hour)";
        },
      ],
      ["api", async () => api],
      [
        "repo",
        async () => {
          const meta = await service.repo(repo);
          return `${meta.fullName} (${meta.defaultBranch})`;
        },
      ],
      ["commits", async () => `${(await service.commits(repo, { perPage: 1 })).length} sampled`],
      ["contributors", async () => `${(await service.contributors(repo)).length} authors`],
      [
        "refs",
        async () => {
          const refs = await service.refs(repo);
          return `${refs.branches.length} branches, ${refs.tags.length} tags`;
        },
      ],
      ["tree", async () => `${(await service.tree(repo)).entries.length} entries`],
    ];

    const results: Check[] = [];
    for (const [name, run] of checks) {
      const started = performance.now();
      try {
        results.push({
          name,
          ok: true,
          ms: Math.round(performance.now() - started),
          detail: await run(),
        });
      } catch (err) {
        results.push({
          name,
          ok: false,
          ms: Math.round(performance.now() - started),
          detail: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const failures = results.filter((result) => !result.ok).length;
    if (values.json) {
      writeJson(results);
      return failures === 0 ? 0 : 1;
    }

    const { bold, down } = palette(colour);
    const lines = formatTable(
      results.map((result) => [
        result.ok ? "ok" : "FAIL",
        result.name,
        `${result.ms}ms`,
        result.detail,
      ]),
      markdown,
      ["status", "check", "ms", "detail"],
    );
    // Colour whole lines: a coloured cell would throw off the column widths.
    write(lines.map((line, index) => (results[index]?.ok ? line : down(line))).join("\n"));
    write("");
    write(bold(failures === 0 ? "All checks passed." : `${failures} check(s) failed.`));
    return failures === 0 ? 0 : 1;
  },
};
