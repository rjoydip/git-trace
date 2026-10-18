import { describe, expect, test } from "bun:test";
import { parseInline, parseMarkdown } from "./markdown";

describe("parseMarkdown", () => {
  test("separates fenced code from surrounding prose", () => {
    const blocks = parseMarkdown("before\n\n```ts\nconst a = 1;\n```\n\nafter");
    expect(blocks).toEqual([
      { type: "paragraph", text: "before" },
      { type: "code", lang: "ts", text: "const a = 1;" },
      { type: "paragraph", text: "after" },
    ]);
  });

  test("keeps list items apart and joins paragraph line breaks", () => {
    expect(parseMarkdown("- one\n- two\n\n1. first\n2. second")).toEqual([
      { type: "list", ordered: false, items: ["one", "two"] },
      { type: "list", ordered: true, items: ["first", "second"] },
    ]);
    expect(parseMarkdown("wrapped\nover lines")).toEqual([
      { type: "paragraph", text: "wrapped over lines" },
    ]);
  });

  test("reads headings, quotes and rules", () => {
    expect(parseMarkdown("## Title\n\n> quoted\n> twice\n\n---")).toEqual([
      { type: "heading", level: 2, text: "Title" },
      { type: "quote", text: "quoted\ntwice" },
      { type: "rule" },
    ]);
  });

  test("an unclosed fence still yields the code it captured", () => {
    expect(parseMarkdown("```\nnope")).toEqual([{ type: "code", lang: "", text: "nope" }]);
  });
});

describe("parseInline", () => {
  test("splits code, emphasis and links, leaving plain text between", () => {
    expect(parseInline("see `x` and **bold** then [docs](https://e.test)")).toEqual([
      { type: "text", text: "see " },
      { type: "code", text: "x" },
      { type: "text", text: " and " },
      { type: "strong", text: "bold" },
      { type: "text", text: " then " },
      { type: "link", text: "docs", href: "https://e.test" },
    ]);
  });

  test("asterisks inside code are not emphasis", () => {
    expect(parseInline("`a * b * c`")).toEqual([{ type: "code", text: "a * b * c" }]);
  });

  test("empty input yields no spans", () => {
    expect(parseInline("")).toEqual([]);
  });
});
