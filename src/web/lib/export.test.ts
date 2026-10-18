import { describe, expect, test } from "bun:test";
import { csvCell, serializeRows } from "./export";

const rows = [
  { path: "src/a.ts", churn: 12 },
  { path: "src/b.ts", churn: 3 },
];

describe("csvCell", () => {
  test("quotes only what needs it", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell(7)).toBe("7");
    expect(csvCell(null)).toBe("");
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("two\nlines")).toBe('"two\nlines"');
  });
});

describe("serializeRows", () => {
  test("keeps column order and shape per format", () => {
    expect(serializeRows(rows, "csv")).toBe("path,churn\nsrc/a.ts,12\nsrc/b.ts,3\n");
    expect(serializeRows(rows, "json")).toBe(`${JSON.stringify(rows, null, 2)}\n`);
    expect(serializeRows(rows, "markdown")).toBe(
      "| path | churn |\n| --- | --- |\n| src/a.ts | 12 |\n| src/b.ts | 3 |\n",
    );
    expect(serializeRows(rows, "text")).toBe(
      "path: src/a.ts\nchurn: 12\n\npath: src/b.ts\nchurn: 3\n",
    );
  });

  test("escapes pipes so a markdown table cannot break out", () => {
    expect(serializeRows([{ path: "a|b" }], "markdown")).toBe("| path |\n| --- |\n| a\\|b |\n");
  });

  test("empty input is an empty result, not a crash", () => {
    expect(serializeRows([], "csv")).toBe("");
    expect(serializeRows([], "markdown")).toBe("");
    expect(serializeRows([], "text")).toBe("");
    expect(serializeRows([], "json")).toBe("[]\n");
  });
});
