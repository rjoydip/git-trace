import { expect, test } from "bun:test";
import {
  assertCommandOptions,
  numberFlag,
  parseCli,
  repoOf,
  usageText,
  UsageError,
  type Command,
} from "../src/cli/args";

const trace: Command = {
  name: "trace",
  summary: "Overview",
  usage: "git-trace trace <owner/name>",
  options: { limit: { type: "string", short: "n", value: "<n>", description: "Commits" } },
  run: async () => {},
};

const commands = [trace];

test("parses command, positionals and flags together", () => {
  const { values, positionals } = parseCli(["trace", "a/b", "--json", "-n", "5"], commands);
  expect(positionals).toEqual(["trace", "a/b"]);
  expect(values.json).toBe(true);
  expect(values.limit).toBe("5");
});

test("rejects a flag the chosen command does not take", () => {
  const { values } = parseCli(["trace", "a/b", "-n", "5"], commands);
  const withoutLimit: Command = { ...trace, name: "commits", options: {} };
  expect(() => assertCommandOptions(values, withoutLimit)).toThrow(UsageError);
});

test("an unknown flag fails the parse outright", () => {
  expect(() => parseCli(["trace", "a/b", "--wat"], commands)).toThrow();
});

test("numberFlag enforces its bounds", () => {
  const bounds = { min: 1, max: 100 };
  expect(numberFlag({ limit: "5" }, "limit", bounds)).toBe(5);
  expect(numberFlag({}, "limit", bounds)).toBeUndefined();
  expect(() => numberFlag({ limit: "0" }, "limit", bounds)).toThrow(UsageError);
  expect(() => numberFlag({ limit: "1.5" }, "limit", bounds)).toThrow(UsageError);
});

test("repoOf prefers the positional and falls back to --repo", () => {
  expect(repoOf({}, ["a/b"])).toBe("a/b");
  expect(repoOf({ repo: "c/d" }, [])).toBe("c/d");
  expect(() => repoOf({}, [])).toThrow(UsageError);
});

test("usage lists the commands and the global options", () => {
  const text = usageText(commands);
  expect(text).toContain("trace");
  expect(text).toContain("--token");
  expect(text).toContain("--api");
  expect(usageText(commands, "trace")).toContain("--limit");
});
