import { expect, test } from "bun:test";
import {
  parseInline,
  parseMarkdown,
  pickPictureSource,
  resolveUrl,
  type MdBlock,
  type MdInline,
  type MdListItem,
} from "./markdown";

const text = (parts: MdInline[]): string =>
  parts
    .map((part) => {
      if (part.type === "text" || part.type === "code") return part.text;
      if (part.type === "image") return part.alt;
      if (part.type === "br") return "\n";
      if (part.type === "kbd" || part.type === "sub" || part.type === "sup") return part.text;
      if ("children" in part) return text(part.children);
      return "";
    })
    .join("");

const first = <T extends MdBlock["type"]>(
  blocks: MdBlock[],
  type: T,
): Extract<MdBlock, { type: T }> => {
  const block = blocks.find((candidate) => candidate.type === type);
  if (!block) throw new Error(`no ${type} block in ${JSON.stringify(blocks)}`);
  return block as Extract<MdBlock, { type: T }>;
};

test("reference links: full, collapsed and shortcut", () => {
  const blocks = parseMarkdown(
    'See [the guide][docs], [docs][] and [docs].\n\n[docs]: https://example.com/docs "Docs"',
  );
  const paragraph = first(blocks, "paragraph");
  const links = paragraph.children.filter((part) => part.type === "link");
  expect(links).toHaveLength(3);
  for (const link of links) {
    if (link.type !== "link") throw new Error("unreachable");
    expect(link.href).toBe("https://example.com/docs");
    expect(link.title).toBe("Docs");
  }
});

test("reference images resolve", () => {
  const [paragraph] = parseMarkdown("![logo][img]\n\n[img]: ./assets/logo.png");
  if (paragraph?.type !== "paragraph") throw new Error("expected paragraph");
  expect(paragraph.children[0]).toEqual({
    type: "image",
    src: "./assets/logo.png",
    alt: "logo",
  });
});

test("GFM table: alignment, inline formatting and escaped pipes", () => {
  const blocks = parseMarkdown(
    "| Name | Value |\n| :--- | ---: |\n| **a** | `b` |\n| c \\| d | e |",
  );
  const table = first(blocks, "table");
  expect(table.align).toEqual(["left", "right"]);
  expect(text(table.header[0] ?? [])).toBe("Name");
  expect(table.rows).toHaveLength(2);
  expect(table.rows[0]?.[0]?.[0]?.type).toBe("strong");
  expect(table.rows[0]?.[1]?.[0]?.type).toBe("code");
  expect(text(table.rows[1]?.[0] ?? [])).toBe("c | d");
});

test("details/summary keeps markdown inside", () => {
  const blocks = parseMarkdown(
    "<details open>\n<summary>More **info**</summary>\n\n- one\n- two\n\n</details>",
  );
  const details = first(blocks, "details");
  expect(details.open).toBe(true);
  expect(text(details.summary)).toBe("More info");
  expect(details.summary.some((part) => part.type === "strong")).toBe(true);
  expect(details.blocks).toHaveLength(1);
  expect(first(details.blocks, "list").items).toHaveLength(2);
});

test("inline HTML whitelist renders nodes instead of tags", () => {
  const parts = parseInline(
    'Press <kbd>Ctrl</kbd><br>next <sub>2</sub> and <sup>3</sup> <img src="x.png" alt="x">',
  );
  expect(parts.some((part) => part.type === "kbd")).toBe(true);
  expect(parts.some((part) => part.type === "br")).toBe(true);
  expect(parts.some((part) => part.type === "sub")).toBe(true);
  expect(parts.some((part) => part.type === "sup")).toBe(true);
  expect(parts.find((part) => part.type === "image")).toMatchObject({
    src: "x.png",
    alt: "x",
  });
});

test("inline HTML links and formatting", () => {
  const parts = parseInline('<a href="https://x.dev">x <b>bold</b></a>');
  const link = parts[0];
  if (link?.type !== "link") throw new Error("expected link");
  expect(link.href).toBe("https://x.dev");
  expect(link.children.some((part) => part.type === "strong")).toBe(true);
});

test("nested lists and task checkboxes", () => {
  const [list] = parseMarkdown("- [x] done\n  - [ ] nested\n- [ ] todo");
  if (list?.type !== "list") throw new Error("expected list");
  expect(list.items).toHaveLength(2);
  expect(list.items[0]?.task).toBe("checked");
  expect(list.items[1]?.task).toBe("unchecked");
  const nested = list.items[0]?.blocks.find((block) => block.type === "list");
  if (nested?.type !== "list") throw new Error("expected nested list");
  expect(nested.items[0]?.task).toBe("unchecked");
});

test("ordered lists keep their start number", () => {
  const [list] = parseMarkdown("3. three\n4. four");
  if (list?.type !== "list") throw new Error("expected list");
  expect(list.ordered).toBe(true);
  expect(list.start).toBe(3);
  expect(list.items).toHaveLength(2);
});

test("bare URLs autolink without swallowing punctuation", () => {
  const parts = parseInline("see https://example.com/docs. and (https://x.dev/a)");
  const links = parts.filter((part) => part.type === "link");
  expect(links.map((link) => (link.type === "link" ? link.href : ""))).toEqual([
    "https://example.com/docs",
    "https://x.dev/a",
  ]);
  expect(text(parts)).toContain(".");
});

test("GitHub callouts keep their flavour and drop the marker", () => {
  const blocks = parseMarkdown(
    "> [!WARNING]\n> Be careful\n\n> [!TIP]\n> Fast\n\n> [!INFO]\n> Alias\n\n> plain",
  );
  const quotes = blocks.filter(
    (block): block is Extract<MdBlock, { type: "quote" }> => block.type === "quote",
  );
  expect(quotes.map((quote) => quote.kind)).toEqual(["warning", "tip", "note", undefined]);

  for (const [index, expected] of ["Be careful", "Fast", "Alias", "plain"].entries()) {
    const content = quotes[index]?.blocks[0];
    if (content?.type !== "paragraph") throw new Error("expected paragraph");
    expect(text(content.children)).toBe(expected);
  }
});

test("theme-aware picture sources pick the site theme, not the OS", () => {
  const parts = parseInline(
    '<picture><source media="(prefers-color-scheme: dark)" srcset="dark.png 1x, dark2.png 2x"><source media="(prefers-color-scheme: light)" srcset="light.png"><img alt="logo" src="fallback.png"></picture>',
  );
  const picture = parts[0];
  if (picture?.type !== "picture") throw new Error("expected picture");
  expect(picture.sources).toEqual([
    { src: "dark.png", media: "(prefers-color-scheme: dark)" },
    { src: "light.png", media: "(prefers-color-scheme: light)" },
  ]);
  expect(picture.image).toEqual({ src: "fallback.png", alt: "logo" });
  expect(pickPictureSource(picture, "dark")).toBe("dark.png");
  expect(pickPictureSource(picture, "light")).toBe("light.png");
});

test("picture falls back to <img> when no source matches", () => {
  const [picture] = parseInline(
    '<picture><source media="(prefers-color-scheme: light)" srcset="light.png"><img src="fallback.png" alt="x"></picture>',
  );
  if (picture?.type !== "picture") throw new Error("expected picture");
  expect(pickPictureSource(picture, "dark")).toBe("fallback.png");
});

test("multi-line picture blocks stay one node", () => {
  const [paragraph] = parseMarkdown(
    '<picture>\n<source media="(prefers-color-scheme: dark)" srcset="dark.png">\n<img src="light.png" alt="logo">\n</picture>',
  );
  if (paragraph?.type !== "paragraph") throw new Error("expected paragraph");
  expect(paragraph.children).toHaveLength(1);
  expect(paragraph.children[0]?.type).toBe("picture");
});

test("strikethrough, autolinks and entities", () => {
  const parts = parseInline("~~gone~~ <https://example.com> A &amp; B &#39;C&#39;");
  expect(parts[0]?.type).toBe("strike");
  const link = parts.find((part) => part.type === "link");
  expect(link).toMatchObject({ href: "https://example.com" });
  expect(text(parts)).toContain("A & B 'C'");
});

test("hard breaks vs soft wraps", () => {
  const hard = parseInline("a  \nb");
  expect(hard.map((part) => part.type)).toEqual(["text", "br", "text"]);
  const soft = parseInline("a\nb");
  expect(text(soft)).toBe("a b");
});

test("escapes stay literal", () => {
  expect(text(parseInline("\\*not em\\*"))).toBe("*not em*");
});

test("code fences keep markdown and reference definitions literal", () => {
  const blocks = parseMarkdown("```md\n[docs]: https://x\n**no** <br>\n```");
  expect(blocks).toEqual([{ type: "code", lang: "md", text: "[docs]: https://x\n**no** <br>" }]);
});

test("setext headings", () => {
  const [heading] = parseMarkdown("Title\n=====");
  if (heading?.type !== "heading") throw new Error("expected heading");
  expect(heading.level).toBe(1);
  expect(text(heading.children)).toBe("Title");
});

test("relative links and images resolve against the file's GitHub URL", () => {
  expect(resolveUrl("./x.md", "https://github.com/o/r/blob/main/docs/")).toBe(
    "https://github.com/o/r/blob/main/docs/x.md",
  );
  expect(resolveUrl("../README.md", "https://github.com/o/r/blob/main/docs/")).toBe(
    "https://github.com/o/r/blob/main/README.md",
  );
  expect(resolveUrl("#section", "https://github.com/o/r/blob/main/")).toBe("#section");
  expect(resolveUrl("https://x.dev", "https://github.com/o/r/")).toBe("https://x.dev");
});

test("blockquote parses nested blocks", () => {
  const [quote] = parseMarkdown("> **bold**\n> - item");
  if (quote?.type !== "quote") throw new Error("expected quote");
  expect(first(quote.blocks, "paragraph").children[0]?.type).toBe("strong");
  expect(first(quote.blocks, "list").items).toHaveLength(1);
});

test("paragraph followed by a rule is not a setext heading", () => {
  const blocks = parseMarkdown("text\n\n---\n\nmore");
  expect(blocks.map((block) => block.type)).toEqual(["paragraph", "rule", "paragraph"]);
});

test("task item bodies keep their blocks", () => {
  const [list] = parseMarkdown("- [ ] first\n- [x] second");
  if (list?.type !== "list") throw new Error("expected list");
  const items: MdListItem[] = list.items;
  expect(items[0]?.blocks[0]?.type).toBe("paragraph");
  const itemBlock = items[0]?.blocks[0];
  if (itemBlock?.type !== "paragraph") throw new Error("expected paragraph");
  expect(text(itemBlock.children)).toBe("first");
});

test("an unclosed fence still yields the code it captured", () => {
  expect(parseMarkdown("```\nnope")).toEqual([{ type: "code", lang: "", text: "nope" }]);
});

test("asterisks inside code are not emphasis", () => {
  expect(parseInline("`a * b * c`")).toEqual([{ type: "code", text: "a * b * c" }]);
});

test("empty input yields no spans", () => {
  expect(parseInline("")).toEqual([]);
});

test("headings, quotes and rules keep their shape", () => {
  const blocks = parseMarkdown("## Title\n\n> quoted\n> twice\n\n---");
  expect(blocks.map((block) => block.type)).toEqual(["heading", "quote", "rule"]);
  const heading = blocks[0];
  if (heading?.type !== "heading") throw new Error("expected heading");
  expect(heading.level).toBe(2);
  expect(text(heading.children)).toBe("Title");
});

test("angle-bracketed reference URLs and one-line details", () => {
  const blocks = parseMarkdown(
    "[docs]: <https://example.com/docs>\n\n[docs]\n\n<details><summary>Hi</summary>**x**</details>",
  );
  const paragraph = first(blocks, "paragraph");
  expect(paragraph.children[0]).toMatchObject({ type: "link", href: "https://example.com/docs" });
  const details = first(blocks, "details");
  expect(text(details.summary)).toBe("Hi");
  expect(first(details.blocks, "paragraph").children[0]?.type).toBe("strong");
});

test("HTML horizontal rules become rules", () => {
  expect(parseMarkdown("a\n<hr>\nb").map((block) => block.type)).toEqual([
    "paragraph",
    "rule",
    "paragraph",
  ]);
});

test("unsafe URL schemes are neutralised", () => {
  expect(resolveUrl("javascript:alert(1)")).toBe("#");
  expect(resolveUrl("data:text/html,x")).toBe("#");
  expect(resolveUrl("mailto:a@b.c")).toBe("mailto:a@b.c");
  expect(resolveUrl("docs/x.md")).toBe("docs/x.md");
});
