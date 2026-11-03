/**
 * Path-shaped commands — the Files tab without the file viewer: the tree, the
 * refs, one tag, and the history of a path.
 */
import { numberFlag, repoOf, stringValue, UsageError, type Command } from "../args";
import { renderFileHistory, renderRefs, renderTag, renderTree, write, writeJson } from "../render";

export const tree: Command = {
  name: "tree",
  summary: "The repository's files as an ASCII tree at one ref",
  usage: "git-trace tree <owner/name> [--ref <branch|tag>] [--dirs] [--filter <glob>]",
  options: {
    ref: {
      type: "string",
      value: "<ref>",
      description: "Branch or tag (default: the default branch)",
    },
    dirs: { type: "boolean", description: "Directories only" },
    filter: {
      type: "string",
      value: "<glob>",
      description: "Keep paths matching a glob, e.g. 'src/*'",
    },
  },

  async run({ service, values, positionals, colour, markdown }) {
    const repo = repoOf(values, positionals);
    const ref = stringValue(values.ref);
    const listing = await service.tree(repo, ref ? { ref } : {});

    const glob = stringValue(values.filter);
    const entries = listing.entries.filter(
      (entry) =>
        (values.dirs !== true || entry.type === "tree") &&
        (glob === undefined || matches(entry.path, glob)),
    );
    const filtered = { ...listing, entries };

    if (values.json) writeJson(filtered);
    else write(renderTree(filtered, { colour, markdown }));
  },
};

export const refs: Command = {
  name: "refs",
  summary: "Branches and tags",
  usage: "git-trace refs <owner/name>",
  options: {},

  async run({ service, values, positionals, colour, markdown }) {
    const all = await service.refs(repoOf(values, positionals));

    if (values.json) writeJson(all);
    else write(renderRefs(all, { colour, markdown }));
  },
};

export const tag: Command = {
  name: "tag",
  summary: "One tag's release notes, or the commit it points at",
  usage: "git-trace tag <owner/name> <tag>",
  options: {},

  async run({ service, values, positionals, colour, markdown }) {
    const repo = repoOf(values, positionals);
    const name = positionals[1];
    if (!name) throw new UsageError("A tag is required: git-trace tag <owner/name> <tag>");
    const detail = await service.tag(repo, name);

    if (values.json) writeJson(detail);
    else write(renderTag(detail, { colour, markdown }));
  },
};

export const fileHistory: Command = {
  name: "file-history",
  summary: "The commits that touched one path",
  usage: "git-trace file-history <owner/name> <path> [--limit <n>]",
  options: {
    limit: { type: "string", short: "n", value: "<n>", description: "Rows (default 50, max 200)" },
  },

  async run({ service, values, positionals, colour, markdown }) {
    const repo = repoOf(values, positionals);
    const path = positionals[1];
    if (!path) {
      throw new UsageError("A path is required: git-trace file-history <owner/name> <path>");
    }
    const limit = numberFlag(values, "limit", { min: 1, max: 200 }) ?? 50;
    const touches = await service.fileHistory(repo, path, { limit });

    if (values.json) writeJson(touches);
    else write(renderFileHistory(touches, { colour, markdown }));
  },
};

/** Glob with `*` as the only wildcard — enough for `src/*` and `*.md`. */
function matches(path: string, glob: string): boolean {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`).test(path);
}
