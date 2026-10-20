/**
 * A small Markdown reader for commit messages, pull-request bodies, comments
 * and README files.
 *
 * It covers the GitHub-flavoured surface that prose in a trace actually uses:
 * headings, fences, quotes, nested/task lists, GFM tables, images, reference
 * links, autolinks, strikethrough and a whitelist of inline HTML. HTML is
 * parsed into React nodes — nothing here produces raw markup, so the renderer
 * never needs `dangerouslySetInnerHTML`.
 *
 * Deliberately out of scope: footnotes, definition lists, raw HTML tables and
 * arbitrary HTML. Unknown tags stay visible as text instead of vanishing.
 */

export interface LinkReference {
  href: string;
  title?: string;
}

export type MdInline =
  | { type: "text"; text: string }
  | { type: "code"; text: string }
  | { type: "strong"; children: MdInline[] }
  | { type: "em"; children: MdInline[] }
  | { type: "strike"; children: MdInline[] }
  | { type: "link"; href: string; title?: string; children: MdInline[] }
  | { type: "image"; src: string; alt: string; title?: string }
  | {
      type: "picture";
      sources: { src: string; media?: string }[];
      image: { src: string; alt: string; title?: string };
    }
  | { type: "br" }
  | { type: "kbd"; text: string }
  | { type: "sub"; text: string }
  | { type: "sup"; text: string };

export type MdAlign = "left" | "center" | "right" | null;

/** The five GitHub alert flavours (plus an INFO alias for NOTE). */
export type CalloutKind = "note" | "tip" | "important" | "warning" | "caution";

export interface MdListItem {
  task: "checked" | "unchecked" | null;
  blocks: MdBlock[];
}

export type MdBlock =
  | { type: "heading"; level: number; children: MdInline[] }
  | { type: "paragraph"; children: MdInline[] }
  | { type: "code"; lang: string; text: string }
  | { type: "quote"; kind?: CalloutKind; blocks: MdBlock[] }
  | { type: "list"; ordered: boolean; start: number; items: MdListItem[] }
  | { type: "rule" }
  | { type: "table"; align: MdAlign[]; header: MdInline[][]; rows: MdInline[][][] }
  | { type: "details"; open: boolean; summary: MdInline[]; blocks: MdBlock[] }
  | { type: "html"; align: Exclude<MdAlign, null>; blocks: MdBlock[] };

const REF_DEF = /^ {0,3}\[([^\]]+)\]:\s*(\S+)(?:\s+["'(](.*?)["')])?\s*$/;
const FENCE = /^\s*(`{3,}|~{3,})\s*(.*)$/;
const HEADING = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const SETEXT = /^ {0,3}(=+|-+)\s*$/;
const RULE = /^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/;
const QUOTE = /^ {0,3}>\s?(.*)$/;
const CALLOUT = /^\[!(NOTE|INFO|TIP|IMPORTANT|WARNING|CAUTION)\]\s*$/i;
const LIST = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/;
const TABLE_DELIM = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)+\|?\s*$/;
const DETAILS_OPEN = /^\s*<details\b([^>]*)>/i;
const DETAILS_ONE_LINE = /^\s*<details\b([^>]*)>([\s\S]*)<\/details>\s*$/i;
const HTML_RULE = /^\s*<hr\s*\/?>\s*$/i;
const PICTURE_OPEN = /^\s*<picture\b/i;
const WRAP_OPEN = /^\s*<(p|div)\b([^>]*)>\s*$/i;
const WRAP_ONE_LINE = /^\s*<(p|div)\b([^>]*)>([\s\S]*)<\/\1>\s*$/i;
const IMAGE_LINE = /^\s*<img\b[^>]*>\s*$/i;

const normRef = (label: string): string => label.trim().toLowerCase().replace(/\s+/g, " ");

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\u00a0",
  copy: "©",
  reg: "®",
  trade: "™",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  times: "×",
  middot: "·",
  rarr: "→",
  larr: "←",
};

/** GitHub hands back entities in bodies; decode the common ones (code spans stay literal). */
export function decodeEntities(source: string): string {
  return source.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, code: string) => {
    if (code.startsWith("#")) {
      const hex = code[1]?.toLowerCase() === "x";
      const value = Number.parseInt(code.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isFinite(value) && value > 0 && value <= 0x10ffff
        ? String.fromCodePoint(value)
        : match;
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? match;
  });
}

/** Resolve a relative Markdown link/image against the file it came from. */
export function resolveUrl(href: string, base?: string): string {
  const trimmed = href.trim();
  const absolute = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(trimmed);
  let resolved = trimmed;
  if (base && !absolute) {
    try {
      resolved = new URL(trimmed, base.endsWith("/") ? base : `${base}/`).toString();
    } catch {
      resolved = trimmed;
    }
  }
  // Markdown can carry `javascript:` or `data:` URLs; only let safe schemes through.
  if (/^[a-z][a-z0-9+.-]*:/i.test(resolved) && !/^(?:https?|mailto|tel):/i.test(resolved)) {
    return "#";
  }
  return resolved;
}

/** Pick the `<source>` that matches the site's theme, falling back to `<img>`. */
export function pickPictureSource(
  picture: Extract<MdInline, { type: "picture" }>,
  mode: "dark" | "light",
): string {
  const match = picture.sources.find((source) =>
    source.media
      ? mode === "dark"
        ? /dark/i.test(source.media)
        : /light/i.test(source.media)
      : false,
  );
  return match?.src ?? picture.image.src;
}

/** Attribute soup → a lowercase map. Quoted and bare values both parse. */
function attributes(source: string): Record<string, string> {
  const out: Record<string, string> = {};
  const pattern = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  for (let match = pattern.exec(source); match; match = pattern.exec(source)) {
    out[match[1]!.toLowerCase()] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return out;
}

/** First candidate in a `srcset` (the browser picks the rest; one is enough here). */
function firstSrcset(value: string): string {
  const first = value.split(",")[0]?.trim() ?? "";
  return first.split(/\s+/)[0] ?? "";
}

function alignmentOf(cell: string): MdAlign {
  const value = cell.trim();
  const left = value.startsWith(":");
  const right = value.endsWith(":");
  if (left && right) return "center";
  if (right) return "right";
  if (left) return "left";
  return null;
}

function leadingSpaces(line: string): number {
  return /^\s*/.exec(line)?.[0].length ?? 0;
}

/** Index of `needle`, skipping escaped occurrences. */
function indexOfUnescaped(source: string, needle: string, from: number): number {
  for (let i = source.indexOf(needle, from); i !== -1; i = source.indexOf(needle, i + 1)) {
    let slashes = 0;
    for (let j = i - 1; j >= 0 && source[j] === "\\"; j--) slashes += 1;
    if (slashes % 2 === 0) return i;
  }
  return -1;
}

function findLabelEnd(source: string, start: number): number {
  let depth = 0;
  for (let i = start; i < source.length; i++) {
    const char = source[i];
    if (char === "\\") {
      i += 1;
      continue;
    }
    if (char === "[") depth += 1;
    if (char === "]") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

interface Destination {
  href: string;
  title?: string;
  end: number;
}

/** Parse `(href "title")`, starting at the opening paren. */
function parseDestination(source: string, start: number): Destination | null {
  let i = start + 1;
  while (i < source.length && /\s/.test(source[i] ?? "")) i += 1;

  let href = "";
  if (source[i] === "<") {
    const end = source.indexOf(">", i + 1);
    if (end === -1) return null;
    href = source.slice(i + 1, end);
    i = end + 1;
  } else {
    let depth = 0;
    while (i < source.length) {
      const char = source[i] ?? "";
      if (char === "\\") {
        href += source[i + 1] ?? "";
        i += 2;
        continue;
      }
      if (char === "(") depth += 1;
      if (char === ")") {
        if (depth === 0) break;
        depth -= 1;
      }
      if (/\s/.test(char) && depth === 0) break;
      href += char;
      i += 1;
    }
  }

  while (i < source.length && /\s/.test(source[i] ?? "")) i += 1;

  let title: string | undefined;
  const opener = source[i];
  if (opener === '"' || opener === "'" || opener === "(") {
    const closer = opener === "(" ? ")" : opener;
    const end = indexOfUnescaped(source, closer, i + 1);
    if (end === -1) return null;
    title = source.slice(i + 1, end);
    i = end + 1;
    while (i < source.length && /\s/.test(source[i] ?? "")) i += 1;
  }

  if (source[i] !== ")") return null;
  return {
    href: decodeEntities(href),
    ...(title === undefined ? {} : { title: decodeEntities(title) }),
    end: i + 1,
  };
}

interface Linkish {
  label: string;
  href: string;
  title?: string;
  end: number;
}

/** `[label](url)`, `[label][ref]`, `[label][]` and `[ref]`. */
function parseLinkish(
  source: string,
  start: number,
  refs: Map<string, LinkReference>,
): Linkish | null {
  if (source[start] !== "[") return null;
  const end = findLabelEnd(source, start);
  if (end === -1) return null;
  const label = source.slice(start + 1, end);
  const after = source[end + 1] ?? "";

  if (after === "(") {
    const destination = parseDestination(source, end + 1);
    if (!destination) return null;
    return {
      label,
      href: destination.href,
      ...(destination.title === undefined ? {} : { title: destination.title }),
      end: destination.end,
    };
  }

  if (after === "[") {
    const refEnd = source.indexOf("]", end + 2);
    if (refEnd === -1) return null;
    const id = source.slice(end + 2, refEnd) || label;
    const ref = refs.get(normRef(id));
    if (!ref) return null;
    return {
      label,
      href: ref.href,
      ...(ref.title === undefined ? {} : { title: ref.title }),
      end: refEnd + 1,
    };
  }

  const ref = refs.get(normRef(label));
  if (!ref) return null;
  return {
    label,
    href: ref.href,
    ...(ref.title === undefined ? {} : { title: ref.title }),
    end: end + 1,
  };
}

/** `<https://…>`, `<mailto:…>` and bare email autolinks. */
function parseAutolink(inner: string): MdInline | null {
  if (/^https?:\/\/[^\s<>]+$/i.test(inner)) {
    return { type: "link", href: inner, children: [{ type: "text", text: inner }] };
  }
  if (/^mailto:[^\s<>]+$/i.test(inner)) {
    return { type: "link", href: inner, children: [{ type: "text", text: inner.slice(7) }] };
  }
  if (/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(inner)) {
    return { type: "link", href: `mailto:${inner}`, children: [{ type: "text", text: inner }] };
  }
  return null;
}

/** Whitelisted inline HTML → the matching Markdown node. */
function parseInlineHtml(
  source: string,
  start: number,
  refs: Map<string, LinkReference>,
): { node: MdInline; end: number } | null {
  const rest = source.slice(start);

  if (/^<br\s*\/?>/i.test(rest)) {
    return { node: { type: "br" }, end: start + /^<br\s*\/?>/i.exec(rest)![0].length };
  }

  if (/^<picture\b/i.test(rest)) {
    const close = /<\/picture\s*>/i.exec(rest);
    if (!close) return null;
    const inner = rest.slice(0, close.index);
    const sources: { src: string; media?: string }[] = [];
    for (const match of inner.matchAll(/<source\b([^>]*?)\/?>/gi)) {
      const attrs = attributes(match[1] ?? "");
      const src = firstSrcset(attrs.srcset ?? attrs.src ?? "");
      if (src) sources.push({ src, ...(attrs.media === undefined ? {} : { media: attrs.media }) });
    }
    const image = /<img\b([^>]*?)\/?>/i.exec(inner);
    const attrs = attributes(image?.[1] ?? "");
    return {
      node: {
        type: "picture",
        sources,
        image: {
          src: attrs.src || sources[0]?.src || "",
          alt: attrs.alt ?? "",
          ...(attrs.title === undefined ? {} : { title: attrs.title }),
        },
      },
      end: start + close.index + close[0].length,
    };
  }

  const image = /^<img\b([^>]*?)\/?>/i.exec(rest);
  if (image) {
    const attrs = attributes(image[1] ?? "");
    return {
      node: {
        type: "image",
        src: attrs.src ?? "",
        alt: attrs.alt ?? "",
        ...(attrs.title === undefined ? {} : { title: attrs.title }),
      },
      end: start + image[0].length,
    };
  }

  const paired = /^<(b|strong|i|em|del|s|code|kbd|sub|sup|a)\b([^>]*)>/i.exec(rest);
  if (!paired) return null;
  const tag = paired[1]!.toLowerCase();
  const openLength = paired[0].length;
  const close = new RegExp(`</${tag}\\s*>`, "i").exec(source.slice(start + openLength));
  if (!close) return null;
  const inner = source.slice(start + openLength, start + openLength + close.index);
  const end = start + openLength + close.index + close[0].length;

  if (tag === "code") return { node: { type: "code", text: decodeEntities(inner) }, end };
  if (tag === "kbd" || tag === "sub" || tag === "sup") {
    return { node: { type: tag, text: decodeEntities(inner) }, end };
  }
  if (tag === "a") {
    const attrs = attributes(paired[2] ?? "");
    if (!attrs.href) return null;
    return {
      node: {
        type: "link",
        href: attrs.href,
        ...(attrs.title === undefined ? {} : { title: attrs.title }),
        children: parseInline(inner, refs),
      },
      end,
    };
  }
  if (tag === "b" || tag === "strong")
    return { node: { type: "strong", children: parseInline(inner, refs) }, end };
  if (tag === "del" || tag === "s")
    return { node: { type: "strike", children: parseInline(inner, refs) }, end };
  return { node: { type: "em", children: parseInline(inner, refs) }, end };
}

function parseEmphasis(
  source: string,
  start: number,
  refs: Map<string, LinkReference>,
): { node: MdInline; end: number } | null {
  const char = source[start] ?? "";
  if (char !== "*" && char !== "_" && char !== "~") return null;
  let run = 0;
  while (source[start + run] === char) run += 1;

  for (const length of [3, 2, 1]) {
    if (run < length) continue;
    if (char === "~" && length !== 2) continue;
    if (length === 1 && char === "~") continue;
    const after = source[start + length] ?? "";
    if (!after || /\s/.test(after)) continue;
    const marker = char.repeat(length);
    const end = indexOfUnescaped(source, marker, start + length);
    if (end === -1) continue;
    const inner = source.slice(start + length, end);
    if (!inner.trim() || /\s$/.test(inner)) continue;
    if (char === "_" && length < 3) {
      const before = source[start - 1] ?? "";
      const afterEnd = source[end + length] ?? "";
      if (/[\w]/.test(before) || /[\w]/.test(afterEnd)) continue;
    }

    const children = parseInline(inner, refs);
    if (length === 2) {
      return { node: { type: char === "~" ? "strike" : "strong", children }, end: end + length };
    }
    if (length === 3) {
      return { node: { type: "strong", children: [{ type: "em", children }] }, end: end + length };
    }
    return { node: { type: "em", children }, end: end + length };
  }
  return null;
}

/** Inline spans: code, links, images, emphasis, autolinks and a safe HTML subset. */
export function parseInline(
  source: string,
  refs: Map<string, LinkReference> = new Map(),
): MdInline[] {
  const out: MdInline[] = [];
  let text = "";
  const pushText = (raw: string) => {
    if (!raw) return;
    const decoded = decodeEntities(raw);
    const pattern = /\bhttps?:\/\/[^\s<>]+/gi;
    let last = 0;
    for (let match = pattern.exec(decoded); match; match = pattern.exec(decoded)) {
      let href = match[0];
      // A sentence's full stop is not part of the URL, and neither is an
      // unmatched closing bracket.
      href = href.replace(/[.,;:!?]+$/, "");
      while (
        href.endsWith(")") &&
        (href.match(/\)/g)?.length ?? 0) > (href.match(/\(/g)?.length ?? 0)
      ) {
        href = href.slice(0, -1);
      }
      if (!href) continue;
      if (match.index > last) out.push({ type: "text", text: decoded.slice(last, match.index) });
      out.push({ type: "link", href, children: [{ type: "text", text: href }] });
      last = match.index + href.length;
    }
    if (last < decoded.length) out.push({ type: "text", text: decoded.slice(last) });
  };
  const flush = () => {
    if (text) pushText(text);
    text = "";
  };
  let i = 0;

  while (i < source.length) {
    const char = source[i] ?? "";

    if (char === "\\" && i + 1 < source.length) {
      const next = source[i + 1] ?? "";
      if (next === "\n") {
        flush();
        out.push({ type: "br" });
        i += 2;
        continue;
      }
      if (/[\\`*_{}[\]()#+\-.!>~|"']/.test(next)) {
        text += next;
        i += 2;
        continue;
      }
    }

    if (char === "\n") {
      if (/ {2,}$/.test(text)) {
        text = text.replace(/ +$/, "");
        flush();
        out.push({ type: "br" });
      } else {
        text += " ";
      }
      i += 1;
      continue;
    }

    if (char === "`") {
      let run = 0;
      while (source[i + run] === "`") run += 1;
      const marker = "`".repeat(run);
      const end = indexOfUnescaped(source, marker, i + run);
      if (end !== -1) {
        flush();
        let inner = source.slice(i + run, end).replace(/\n/g, " ");
        if (inner.length > 2 && inner.startsWith(" ") && inner.endsWith(" ")) {
          inner = inner.slice(1, -1);
        }
        out.push({ type: "code", text: inner });
        i = end + run;
        continue;
      }
    }

    if (char === "!" && source[i + 1] === "[") {
      const link = parseLinkish(source, i + 1, refs);
      if (link) {
        flush();
        out.push({
          type: "image",
          src: link.href,
          alt: link.label.replace(/[*_`~]/g, ""),
          ...(link.title === undefined ? {} : { title: link.title }),
        });
        i = link.end;
        continue;
      }
    }

    if (char === "[") {
      const link = parseLinkish(source, i, refs);
      if (link) {
        flush();
        out.push({
          type: "link",
          href: link.href,
          ...(link.title === undefined ? {} : { title: link.title }),
          children: parseInline(link.label, refs),
        });
        i = link.end;
        continue;
      }
    }

    if (char === "<") {
      const close = source.indexOf(">", i + 1);
      if (close !== -1) {
        const autolink = parseAutolink(source.slice(i + 1, close));
        if (autolink) {
          flush();
          out.push(autolink);
          i = close + 1;
          continue;
        }
        const html = parseInlineHtml(source, i, refs);
        if (html) {
          flush();
          out.push(html.node);
          i = html.end;
          continue;
        }
      }
    }

    if (char === "*" || char === "_" || char === "~") {
      const emphasis = parseEmphasis(source, i, refs);
      if (emphasis) {
        flush();
        out.push(emphasis.node);
        i = emphasis.end;
        continue;
      }
    }

    text += char;
    i += 1;
  }

  flush();
  return out;
}

/** Split a GFM table row on unescaped pipes. */
function splitRow(line: string): string[] {
  let value = line.trim();
  if (value.startsWith("|")) value = value.slice(1);
  if (value.endsWith("|") && !value.endsWith("\\|")) value = value.slice(0, -1);

  const cells: string[] = [];
  let cell = "";
  for (let i = 0; i < value.length; i++) {
    const char = value[i] ?? "";
    if (char === "\\" && value[i + 1] === "|") {
      cell += "|";
      i += 1;
      continue;
    }
    if (char === "|") {
      cells.push(cell.trim());
      cell = "";
      continue;
    }
    cell += char;
  }
  cells.push(cell.trim());
  return cells;
}

function isTableStart(lines: string[], index: number): boolean {
  const header = lines[index] ?? "";
  const delimiter = lines[index + 1] ?? "";
  if (!header.includes("|") || !TABLE_DELIM.test(delimiter)) return false;
  return splitRow(header).length === splitRow(delimiter).length;
}

function parseFence(lines: string[], index: number): { block: MdBlock; next: number } {
  const open = FENCE.exec(lines[index] ?? "");
  const marker = open?.[1] ?? "```";
  const lang = (open?.[2] ?? "").trim().split(/\s+/)[0] ?? "";
  const body: string[] = [];
  let i = index + 1;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    const close = FENCE.exec(line);
    if (close && close[2] === "" && (close[1]?.[0] === marker[0] || line.trim() === marker)) {
      i += 1;
      break;
    }
    body.push(line);
    i += 1;
  }
  return { block: { type: "code", lang, text: body.join("\n") }, next: i };
}

function buildDetails(inner: string, isOpen: boolean, refs: Map<string, LinkReference>): MdBlock {
  const summaryMatch = /<summary\b[^>]*>([\s\S]*?)<\/summary>/i.exec(inner);
  const summary = summaryMatch ? parseInline(summaryMatch[1]?.trim() ?? "", refs) : [];
  const body = summaryMatch ? inner.replace(summaryMatch[0], "") : inner;
  return {
    type: "details",
    open: isOpen,
    summary: summary.length ? summary : [{ type: "text", text: "Details" }],
    blocks: parseBlocks(body.split("\n"), refs),
  };
}

function parseDetails(
  lines: string[],
  index: number,
  refs: Map<string, LinkReference>,
): { block: MdBlock; next: number } {
  const line = lines[index] ?? "";
  const oneLine = DETAILS_ONE_LINE.exec(line);
  if (oneLine) {
    return {
      block: buildDetails(oneLine[2] ?? "", /\bopen\b/i.test(oneLine[1] ?? ""), refs),
      next: index + 1,
    };
  }

  const openTag = DETAILS_OPEN.exec(line);
  const isOpen = /\bopen\b/i.test(openTag?.[1] ?? "");
  const inner: string[] = [];
  let depth = 1;
  let i = index + 1;
  while (i < lines.length) {
    const next = lines[i] ?? "";
    depth += (next.match(/<details\b/gi) ?? []).length;
    depth -= (next.match(/<\/details>/gi) ?? []).length;
    if (depth <= 0) {
      i += 1;
      break;
    }
    inner.push(next);
    i += 1;
  }

  return { block: buildDetails(inner.join("\n"), isOpen, refs), next: i };
}

function parseWrap(
  lines: string[],
  index: number,
  refs: Map<string, LinkReference>,
): { block: MdBlock; next: number } | null {
  const line = lines[index] ?? "";
  const oneLine = WRAP_ONE_LINE.exec(line);
  if (oneLine) {
    const attrs = attributes(oneLine[2] ?? "");
    const align = (attrs.align ?? "").toLowerCase();
    return {
      block: {
        type: "html",
        align: align === "center" || align === "right" ? align : "left",
        blocks: parseBlocks([oneLine[3] ?? ""], refs),
      },
      next: index + 1,
    };
  }

  const open = WRAP_OPEN.exec(line);
  if (!open) return null;
  const tag = open[1]!.toLowerCase();
  const attrs = attributes(open[2] ?? "");
  const align = (attrs.align ?? "").toLowerCase();
  const inner: string[] = [];
  let i = index + 1;
  while (i < lines.length) {
    if (new RegExp(`^\\s*</${tag}>\\s*$`, "i").test(lines[i] ?? "")) {
      i += 1;
      break;
    }
    inner.push(lines[i] ?? "");
    i += 1;
  }
  return {
    block: {
      type: "html",
      align: align === "center" || align === "right" ? align : "left",
      blocks: parseBlocks(inner, refs),
    },
    next: i,
  };
}

function parseList(
  lines: string[],
  index: number,
  refs: Map<string, LinkReference>,
): { block: MdBlock; next: number } {
  const first = LIST.exec(lines[index] ?? "")!;
  const baseIndent = first[1]?.length ?? 0;
  const ordered = /^\d/.test(first[2] ?? "");
  const start = ordered ? Number.parseInt(first[2] ?? "1", 10) : 1;
  const items: MdListItem[] = [];
  let i = index;

  while (i < lines.length) {
    const marker = LIST.exec(lines[i] ?? "");
    if (!marker) break;
    if ((marker[1]?.length ?? 0) !== baseIndent) break;
    if (/^\d/.test(marker[2] ?? "") !== ordered) break;

    const contentIndent = baseIndent + (marker[2]?.length ?? 1) + 1;
    const itemLines = [marker[3] ?? ""];
    i += 1;

    while (i < lines.length) {
      const line = lines[i] ?? "";
      if (!line.trim()) {
        const next = lines[i + 1] ?? "";
        if (next.trim() && leadingSpaces(next) >= contentIndent) {
          itemLines.push("");
          i += 1;
          continue;
        }
        break;
      }
      const indent = leadingSpaces(line);
      if (indent >= contentIndent) {
        itemLines.push(line.slice(contentIndent));
        i += 1;
        continue;
      }
      if (indent > baseIndent && LIST.test(line)) {
        itemLines.push(line.slice(Math.min(indent, contentIndent)));
        i += 1;
        continue;
      }
      if (indent > baseIndent) {
        itemLines.push(line.trim());
        i += 1;
        continue;
      }
      break;
    }

    const task = /^\[([ xX])\]\s+/.exec(itemLines[0] ?? "");
    if (task) itemLines[0] = (itemLines[0] ?? "").slice(task[0].length);
    items.push({
      task: task ? (task[1]?.toLowerCase() === "x" ? "checked" : "unchecked") : null,
      blocks: parseBlocks(itemLines, refs),
    });
  }

  return { block: { type: "list", ordered, start, items }, next: i };
}

function isBlockStart(lines: string[], index: number): boolean {
  const line = lines[index] ?? "";
  if (!line.trim()) return true;
  if (FENCE.test(line) || HEADING.test(line) || RULE.test(line) || QUOTE.test(line)) return true;
  if (HTML_RULE.test(line) || LIST.test(line) || isTableStart(lines, index)) return true;
  if (
    DETAILS_OPEN.test(line) ||
    WRAP_OPEN.test(line) ||
    IMAGE_LINE.test(line) ||
    PICTURE_OPEN.test(line)
  )
    return true;
  return false;
}

function parseBlocks(lines: string[], refs: Map<string, LinkReference>): MdBlock[] {
  const blocks: MdBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";

    if (!line.trim()) {
      i += 1;
      continue;
    }

    if (FENCE.test(line)) {
      const parsed = parseFence(lines, i);
      blocks.push(parsed.block);
      i = parsed.next;
      continue;
    }

    if (/^\s*<!--/.test(line)) {
      while (i < lines.length && !/-->/.test(lines[i] ?? "")) i += 1;
      i += 1;
      continue;
    }

    if (DETAILS_OPEN.test(line)) {
      const parsed = parseDetails(lines, i, refs);
      blocks.push(parsed.block);
      i = parsed.next;
      continue;
    }

    const wrap = parseWrap(lines, i, refs);
    if (wrap) {
      blocks.push(wrap.block);
      i = wrap.next;
      continue;
    }

    if (RULE.test(line) || HTML_RULE.test(line)) {
      blocks.push({ type: "rule" });
      i += 1;
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading?.[1]) {
      blocks.push({
        type: "heading",
        level: heading[1].length,
        children: parseInline(heading[2] ?? "", refs),
      });
      i += 1;
      continue;
    }

    if (QUOTE.test(line)) {
      const inner: string[] = [];
      while (i < lines.length) {
        const quoted = QUOTE.exec(lines[i] ?? "");
        if (!quoted) break;
        inner.push(quoted[1] ?? "");
        i += 1;
      }
      const marker = CALLOUT.exec((inner[0] ?? "").trim());
      const kind = marker
        ? ((marker[1]?.toLowerCase() === "info" ? "note" : marker[1]?.toLowerCase()) as CalloutKind)
        : undefined;
      if (kind) inner.shift();
      blocks.push({
        type: "quote",
        ...(kind === undefined ? {} : { kind }),
        blocks: parseBlocks(inner, refs),
      });
      continue;
    }

    if (LIST.test(line)) {
      const parsed = parseList(lines, i, refs);
      blocks.push(parsed.block);
      i = parsed.next;
      continue;
    }

    if (isTableStart(lines, i)) {
      const header = splitRow(line).map((cell) => parseInline(cell, refs));
      const align = splitRow(lines[i + 1] ?? "").map(alignmentOf);
      i += 2;
      const rows: MdInline[][][] = [];
      while (i < lines.length) {
        const row = lines[i] ?? "";
        if (!row.trim() || !row.includes("|") || isBlockStart(lines, i)) break;
        const cells = splitRow(row);
        rows.push(header.map((_, index) => parseInline(cells[index] ?? "", refs)));
        i += 1;
      }
      blocks.push({ type: "table", align, header, rows });
      continue;
    }

    if (PICTURE_OPEN.test(line)) {
      const collected: string[] = [];
      while (i < lines.length) {
        const next = lines[i] ?? "";
        collected.push(next);
        i += 1;
        if (/<\/picture\s*>/i.test(next)) break;
      }
      blocks.push({ type: "paragraph", children: parseInline(collected.join("\n"), refs) });
      continue;
    }

    if (IMAGE_LINE.test(line)) {
      blocks.push({ type: "paragraph", children: parseInline(line.trim(), refs) });
      i += 1;
      continue;
    }

    if (/^(?: {4,}| {0,3}\t)/.test(line)) {
      const body: string[] = [];
      while (
        i < lines.length &&
        (/^(?: {4,}| {0,3}\t)/.test(lines[i] ?? "") || !(lines[i] ?? "").trim())
      ) {
        body.push((lines[i] ?? "").replace(/^(?: {4}| {0,3}\t)/, ""));
        i += 1;
      }
      while (body.length && !body[body.length - 1]?.trim()) body.pop();
      blocks.push({ type: "code", lang: "", text: body.join("\n") });
      continue;
    }

    const body: string[] = [];
    let setextLevel = 0;
    while (i < lines.length) {
      const next = lines[i] ?? "";
      if (!next.trim()) break;
      if (body.length > 0 && SETEXT.test(next) && !LIST.test(next)) {
        setextLevel = (SETEXT.exec(next)?.[1]?.[0] ?? "=") === "=" ? 1 : 2;
        i += 1;
        break;
      }
      if (body.length > 0 && isBlockStart(lines, i)) break;
      body.push(next);
      i += 1;
    }
    if (!body.length) continue;
    if (setextLevel) {
      blocks.push({
        type: "heading",
        level: setextLevel,
        children: parseInline(body.join("\n"), refs),
      });
    } else {
      blocks.push({ type: "paragraph", children: parseInline(body.join("\n"), refs) });
    }
  }

  return blocks;
}

/** Block structure of a Markdown document, with reference definitions resolved. */
export function parseMarkdown(source: string): MdBlock[] {
  const normalized = source.replace(/\r\n?/g, "\n").replace(/\t/g, "    ");
  const lines = normalized.split("\n");
  const refs = new Map<string, LinkReference>();
  const kept: string[] = [];
  let fence: string | null = null;

  for (const line of lines) {
    const marker = FENCE.exec(line);
    if (marker?.[1]) {
      const char = marker[1][0] ?? "`";
      if (!fence) fence = char;
      else if (fence === char && marker[2] === "") fence = null;
      kept.push(line);
      continue;
    }

    if (!fence) {
      const definition = REF_DEF.exec(line);
      if (definition?.[1] && definition[2]) {
        refs.set(normRef(definition[1]), {
          href: decodeEntities(definition[2].replace(/^<|>$/g, "")),
          ...(definition[3] === undefined ? {} : { title: decodeEntities(definition[3]) }),
        });
        kept.push("");
        continue;
      }
    }
    kept.push(line);
  }

  return parseBlocks(kept, refs);
}
