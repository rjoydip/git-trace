/**
 * Text and Markdown renderers. Both take their formatting decisions from
 * `RenderOptions`, so output stays snapshot-testable without a TTY and `--json`
 * never depends on a terminal.
 */
import type { TracePayload } from "../core/service";
import type { FileTouch } from "../core/trace";
import type {
  ActivityBucket,
  Commit,
  CommitDetail,
  HotFile,
  ItemSummary,
  RepoRefs,
  RepoTree,
  TagDetail,
  TrackedItem,
} from "../core/types";
import type { AuthorRollup } from "../core/trace";

const numbers = new Intl.NumberFormat("en");
const dayFormat = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
const stampFormat = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "UTC",
});

const day = (iso: string | null): string => (iso ? dayFormat.format(new Date(iso)) : "—");
const stamp = (iso: string | null): string => (iso ? stampFormat.format(new Date(iso)) : "—");

export interface RenderOptions {
  colour: boolean;
  /** Piped output is Markdown; `--md` asks for it on a TTY too. */
  markdown?: boolean;
}

export interface Palette {
  bold: (text: string) => string;
  dim: (text: string) => string;
  up: (text: string) => string;
  down: (text: string) => string;
  accent: (text: string) => string;
  heading: (text: string) => string;
}

export function palette(colour: boolean, markdown = false): Palette {
  if (markdown) {
    const plain = (text: string) => text;
    return {
      bold: (text) => `**${text}**`,
      dim: plain,
      up: plain,
      down: plain,
      accent: plain,
      heading: (text) => `### ${text}`,
    };
  }
  const paint = (code: string) => (text: string) => (colour ? `\x1b[${code}m${text}\x1b[0m` : text);
  const bold = paint("1");
  return {
    bold,
    dim: paint("2"),
    up: paint("32"),
    down: paint("31"),
    accent: paint("36"),
    heading: bold,
  };
}

/* ------------------------------------------------------------------ output */

export function write(text: string): void {
  process.stdout.write(`${text}\n`);
}

export function writeJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

/* ----------------------------------------------------------------- overview */

/** The Overview tab: metadata, four headline metrics, top people and hot files. */
export function renderTrace(payload: TracePayload, options: RenderOptions): string {
  const { meta, stats } = payload;
  const markdown = options.markdown === true;
  const { bold, dim, up, down, heading } = palette(options.colour, markdown);

  const out: string[] = [];
  const facets = [meta.defaultBranch, meta.language].filter(Boolean).join(" · ");
  out.push(`${bold(payload.repo)}${dim(`  ·  ${facets}`)}`);
  if (meta.description) out.push(dim(meta.description));
  out.push(
    dim(
      `${numbers.format(meta.stars)} stars · ${numbers.format(meta.forks)} forks · ` +
        `${numbers.format(meta.openIssues)} open issues`,
    ),
  );

  const span =
    stats.firstCommit && stats.lastCommit
      ? `${day(stats.firstCommit)} → ${day(stats.lastCommit)}`
      : "";

  out.push("");
  if (markdown) {
    out.push(
      `- **Commits** ${numbers.format(stats.commits)}${span ? ` · ${span}` : ""}`,
      `- **Authors** ${numbers.format(stats.authors)}`,
      `- **Files** ${numbers.format(stats.filesTouched)}`,
      `- **Churn** +${numbers.format(stats.additions)} −${numbers.format(stats.deletions)}`,
    );
  } else {
    const rows: Array<[string, string]> = [
      ["Commits", numbers.format(stats.commits)],
      ["Authors", numbers.format(stats.authors)],
      ["Files", numbers.format(stats.filesTouched)],
      [
        "Churn",
        `${up(`+${numbers.format(stats.additions)}`)} ${down(`−${numbers.format(stats.deletions)}`)}`,
      ],
    ];
    const width = Math.max(...rows.map(([label]) => label.length));
    for (const [index, [label, value]] of rows.entries()) {
      const suffix = index === 0 && span ? `  ${span}` : "";
      out.push(`  ${label.padEnd(width)}  ${value}${suffix}`);
    }
  }

  if (payload.contributors.length > 0) {
    out.push("", heading("Contributors"));
    out.push(
      ...formatTable(
        payload.contributors
          .slice(0, 5)
          .map((author) => [
            author.login ?? author.name,
            `${numbers.format(author.commits)} commits`,
            `last ${day(author.lastCommit)}`,
          ]),
        markdown,
        ["author", "commits", "last"],
      ),
    );
    if (payload.contributors.length > 5) {
      out.push(dim(`+${payload.contributors.length - 5} more`));
    }
  }

  if (payload.hotFiles.length > 0) {
    out.push("", heading("Hot files"));
    out.push(
      ...formatTable(payload.hotFiles.slice(0, 8).map(hotFileRow), markdown, [
        "file",
        "commits",
        "lines",
        "churn",
      ]),
    );
    if (payload.hotFiles.length > 8) {
      out.push(dim(`+${payload.hotFiles.length - 8} more`));
    }
  }

  return out.join("\n");
}

/* ------------------------------------------------------------------ commits */

export function renderCommits(
  commits: Commit[],
  options: RenderOptions & { body?: boolean },
): string {
  const markdown = options.markdown === true;
  if (commits.length === 0) return palette(options.colour, markdown).dim("No commits matched.");
  // With bodies, this is the Comments tab: same commits, read instead of scanned.
  if (options.body) return renderComments(commits, options);
  return formatTable(
    commits.map((commit) => [
      stamp(commit.date),
      commit.shortSha,
      commit.author.login ?? commit.author.name,
      commit.subject,
    ]),
    markdown,
    ["when", "sha", "author", "subject"],
  ).join("\n");
}

export function renderCommit(detail: CommitDetail, options: RenderOptions): string {
  const markdown = options.markdown === true;
  const { bold, dim, up, down } = palette(options.colour, markdown);
  const out: string[] = [];
  out.push(`${bold(detail.shortSha)}  ${detail.subject}`);
  out.push(
    dim(
      `${detail.author.login ?? detail.author.name} <${detail.author.email}>  ·  ${stamp(detail.date)}`,
    ),
  );

  const body = messageBody(detail.message);
  if (body) {
    out.push("", ...body.split("\n"));
  }

  const statusCount = `${detail.files.length} file${detail.files.length === 1 ? "" : "s"}`;
  out.push(
    "",
    `${up(`+${numbers.format(detail.stats.additions)}`)} ${down(`−${numbers.format(detail.stats.deletions)}`)}  ${dim(statusCount)}`,
  );
  if (detail.files.length > 0) {
    out.push(
      "",
      ...formatTable(
        detail.files.map((file) => [
          statusLetter(file.status),
          file.filename,
          `+${numbers.format(file.additions)} −${numbers.format(file.deletions)}`,
        ]),
        markdown,
        ["status", "file", "lines"],
      ),
    );
  }
  return out.join("\n");
}

/** The Comments tab: full commit messages, newest first. */
export function renderComments(commits: Commit[], options: RenderOptions): string {
  const markdown = options.markdown === true;
  const { bold, dim } = palette(options.colour, markdown);
  if (commits.length === 0) return dim("No comments.");
  return commits
    .map((commit) => {
      const head = `${bold(commit.author.login ?? commit.author.name)} ${dim(`· ${stamp(commit.date)} · ${commit.shortSha}`)}`;
      const body = messageBody(commit.message);
      const subject = bold(commit.subject);
      return body ? `${head}\n\n${subject}\n\n${body}` : `${head}\n\n${subject}`;
    })
    .join(markdown ? "\n\n---\n\n" : "\n\n");
}

/* ------------------------------------------------------------------- people */

export function renderContributors(rollups: AuthorRollup[], options: RenderOptions): string {
  const markdown = options.markdown === true;
  if (rollups.length === 0) return palette(options.colour, markdown).dim("No contributors.");
  return formatTable(
    rollups.map((author) => [
      author.login ?? author.name,
      `${numbers.format(author.commits)} commits`,
      `last ${day(author.lastCommit)}`,
    ]),
    markdown,
    ["author", "commits", "last"],
  ).join("\n");
}

export function renderHotFiles(files: HotFile[], options: RenderOptions): string {
  const markdown = options.markdown === true;
  if (files.length === 0) return palette(options.colour, markdown).dim("No files changed.");
  return formatTable(files.map(hotFileRow), markdown, ["file", "commits", "lines", "churn"]).join(
    "\n",
  );
}

export function renderActivity(
  buckets: ActivityBucket[],
  options: RenderOptions & { bar?: boolean },
): string {
  const markdown = options.markdown === true;
  const { bold, dim } = palette(options.colour, markdown);
  if (buckets.length === 0) return dim("No activity.");
  const total = buckets.reduce((sum, bucket) => sum + bucket.count, 0);
  const peak = Math.max(...buckets.map((bucket) => bucket.count));
  const summary = `${numbers.format(total)} commits over ${buckets.length} day${buckets.length === 1 ? "" : "s"}`;

  if (markdown) {
    return [
      `${bold(summary)}, peak ${peak}/day`,
      "",
      ...formatTable(
        buckets.map((bucket) => [bucket.date, numbers.format(bucket.count)]),
        true,
        ["date", "commits"],
      ),
    ].join("\n");
  }

  const out = [`${bold(summary)}  ${dim(`peak ${peak}/day`)}`, ""];
  for (const bucket of buckets) {
    if (options.bar) {
      const width = bucket.count === 0 ? 0 : Math.max(1, Math.round((bucket.count / peak) * 24));
      out.push(`  ${bucket.date}  ${"▇".repeat(width).padEnd(24)} ${bucket.count}`);
    } else {
      out.push(`  ${bucket.date}  ${numbers.format(bucket.count)}`);
    }
  }
  return out.join("\n");
}

/* -------------------------------------------------------- pull requests etc */

export function renderItems(items: ItemSummary[], options: RenderOptions): string {
  const markdown = options.markdown === true;
  if (items.length === 0) return palette(options.colour, markdown).dim("No open items.");
  return formatTable(
    items.map((item) => [
      `#${item.number}`,
      item.kind === "pull" ? "PR" : "issue",
      `${item.state}${item.merged ? " (merged)" : ""}${item.draft ? " (draft)" : ""}`,
      item.title,
      item.author.login,
      `updated ${day(item.updatedAt)}`,
    ]),
    markdown,
    ["#", "kind", "state", "title", "author", "updated"],
  ).join("\n");
}

/** The PR / Issue tab: the item, its numbers, and its flattened timeline. */
export function renderTrack(item: TrackedItem, options: RenderOptions): string {
  const markdown = options.markdown === true;
  const { bold, dim, up, down, accent, heading } = palette(options.colour, markdown);
  const out: string[] = [];
  const state = item.merged ? "merged" : item.state;
  out.push(`${bold(`#${item.number}`)}  ${bold(item.title)}  ${accent(state.toUpperCase())}`);
  out.push(
    dim(
      `${item.kind === "pull" ? "pull request" : "issue"} · by ${item.author.login} · opened ${day(item.createdAt)}`,
    ),
  );
  if (item.kind === "pull" && item.base && item.head) {
    out.push(dim(`${item.head} → ${item.base}`));
  }
  if (item.labels.length > 0) {
    out.push(dim(`labels: ${item.labels.map((label) => label.name).join(", ")}`));
  }
  out.push(
    "",
    `${up(`+${numbers.format(item.additions)}`)} ${down(`−${numbers.format(item.deletions)}`)}  ` +
      dim(
        `${item.changedFiles} file${item.changedFiles === 1 ? "" : "s"} · ${item.commitCount} commit${item.commitCount === 1 ? "" : "s"} · ${item.comments} comment${item.comments === 1 ? "" : "s"}`,
      ),
  );

  const body = item.body.trim();
  if (body) out.push("", truncate(body, 2_000));

  if (item.activity.length > 0) {
    out.push("", heading("Activity"));
    out.push(
      ...formatTable(
        item.activity.map((entry) => [
          stamp(entry.at),
          entry.kind,
          entry.actor.login,
          truncate(entry.text.replace(/\s+/g, " ").trim(), 90),
        ]),
        markdown,
        ["when", "kind", "actor", "text"],
      ),
    );
  }
  return out.join("\n");
}

/* -------------------------------------------------------------------- files */

export function renderTree(tree: RepoTree, options: RenderOptions): string {
  const markdown = options.markdown === true;
  const { bold, dim, accent } = palette(options.colour, markdown);
  const count = `${tree.entries.length} ${tree.entries.length === 1 ? "entry" : "entries"}`;
  const out = [`${bold(tree.repo)}${dim(`  @ ${tree.ref}`)}  ${dim(count)}`, ""];

  if (tree.entries.length === 0) {
    out.push(dim("(no entries)"));
  } else {
    const lines: string[] = [];
    const children = [...buildTree(tree.entries).children.values()];
    children.forEach((child, index) => {
      walkTree(child, "", index === children.length - 1, lines, accent);
    });
    // A fenced tree keeps the box-drawing intact in Markdown and in an LLM.
    out.push(...(markdown ? ["```text", ...lines, "```"] : lines));
  }

  if (tree.truncated) out.push("", dim("Listing truncated by GitHub."));
  return out.join("\n");
}

interface TreeNode {
  name: string;
  dir: boolean;
  children: Map<string, TreeNode>;
}

/** The flat GitHub listing is paths; a tree needs the directories in between. */
function buildTree(entries: RepoTree["entries"]): TreeNode {
  const root: TreeNode = { name: "", dir: true, children: new Map() };
  for (const entry of entries) {
    const parts = entry.path.split("/").filter(Boolean);
    let node = root;
    parts.forEach((part, index) => {
      const last = index === parts.length - 1;
      let child = node.children.get(part);
      if (!child) {
        child = { name: part, dir: !last || entry.type === "tree", children: new Map() };
        node.children.set(part, child);
      }
      if (last && entry.type === "tree") child.dir = true;
      node = child;
    });
  }
  return root;
}

function walkTree(
  node: TreeNode,
  prefix: string,
  last: boolean,
  out: string[],
  paint: (text: string) => string,
): void {
  const label = node.dir ? `${node.name}/` : node.name;
  out.push(`${prefix}${last ? "└── " : "├── "}${node.dir ? paint(label) : label}`);
  const children = [...node.children.values()];
  const next = `${prefix}${last ? "    " : "│   "}`;
  children.forEach((child, index) => {
    walkTree(child, next, index === children.length - 1, out, paint);
  });
}

export function renderRefs(refs: RepoRefs, options: RenderOptions): string {
  const markdown = options.markdown === true;
  const { bold, dim, heading } = palette(options.colour, markdown);
  const out = [`${bold("default")}  ${refs.defaultBranch}`];
  out.push("", heading(`branches (${refs.branches.length})`));
  out.push(...bullets(refs.branches, markdown));
  out.push("", heading(`tags (${refs.tags.length})`));
  out.push(...(refs.tags.length > 0 ? bullets(refs.tags, markdown) : [dim("none")]));
  return out.join("\n");
}

export function renderTag(tag: TagDetail, options: RenderOptions & { notes?: boolean }): string {
  const markdown = options.markdown === true;
  const { bold, dim } = palette(options.colour, markdown);
  const out: string[] = [];
  out.push(`${bold(tag.tag)}  ${bold(tag.title)}`);
  out.push(
    dim(
      `${tag.kind === "release" ? "release" : "commit"}${tag.author ? ` · ${tag.author}` : ""}${tag.publishedAt ? ` · ${day(tag.publishedAt)}` : ""}${tag.prerelease ? " · prerelease" : ""}`,
    ),
  );
  const body = (tag.body ?? "").trim();
  if (body && options.notes !== false) out.push("", body);
  return out.join("\n");
}

export function renderFileHistory(touches: FileTouch[], options: RenderOptions): string {
  const markdown = options.markdown === true;
  if (touches.length === 0) {
    return palette(options.colour, markdown).dim("No commits touched that path.");
  }
  return formatTable(
    touches.map((touch) => [
      day(touch.date),
      touch.shortSha,
      touch.author,
      touch.status,
      `+${numbers.format(touch.additions)} −${numbers.format(touch.deletions)}`,
      touch.subject,
    ]),
    markdown,
    ["when", "sha", "author", "status", "lines", "subject"],
  ).join("\n");
}

/* ------------------------------------------------------------------ helpers */

function hotFileRow(file: HotFile): string[] {
  return [
    file.path,
    `${numbers.format(file.commits)} commits`,
    `+${numbers.format(file.additions)} −${numbers.format(file.deletions)}`,
    `churn ${numbers.format(file.churn)}`,
  ];
}

/**
 * A table. Text mode pads columns and indents them; Markdown mode emits a GFM
 * table with the given header. Cells are plain, so widths never count escapes.
 */
export function formatTable(rows: string[][], markdown = false, header: string[] = []): string[] {
  if (markdown) {
    const head = header.length > 0 ? header : (rows[0]?.map(() => "") ?? []);
    const escape = (cell: string) => cell.replace(/\|/g, "\\|").replace(/\n/g, " ") || " ";
    return [
      `| ${head.map(escape).join(" | ")} |`,
      `| ${head.map(() => "---").join(" | ")} |`,
      ...rows.map((cells) => `| ${cells.map(escape).join(" | ")} |`),
    ];
  }

  const widths = rows[0]?.map((_, column) =>
    Math.max(...rows.map((row) => (row[column] ?? "").length)),
  );
  return rows.map((cells) => {
    const line = cells
      .map((cell, column) => {
        if (column === cells.length - 1) return cell;
        const pad = (widths?.[column] ?? 0) - cell.length;
        return cell + " ".repeat(Math.max(0, pad));
      })
      .join("  ");
    return `  ${line}`.replace(/ +$/, "");
  });
}

function bullets(items: string[], markdown: boolean): string[] {
  return items.map((item) => (markdown ? `- ${item}` : `  ${item}`));
}

function messageBody(message: string): string {
  return message.split("\n").slice(1).join("\n").trim();
}

function statusLetter(status: string): string {
  return { added: "A", modified: "M", removed: "D", renamed: "R" }[status] ?? "?";
}

function truncate(text: string, limit: number): string {
  return text.length <= limit ? text : `${text.slice(0, limit - 1)}…`;
}
