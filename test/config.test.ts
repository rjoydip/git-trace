import { expect, test } from "bun:test";
import { join } from "node:path";
import { configPath, parseConfig } from "../src/cli/config";

test("configPath honours XDG_CONFIG_HOME, then falls back to ~/.config", () => {
  expect(configPath({ XDG_CONFIG_HOME: "/tmp/xdg" }, "/home/dev")).toBe(
    join("/tmp/xdg", "git-trace", "config.json"),
  );
  expect(configPath({}, "/home/dev")).toBe(
    join("/home/dev", ".config", "git-trace", "config.json"),
  );
});

test("an empty config is valid", () => {
  expect(parseConfig("{}")).toEqual({});
});

test("api is read and trimmed", () => {
  expect(parseConfig('{ "api": " http://127.0.0.1:4010 " }')).toEqual({
    api: "http://127.0.0.1:4010",
  });
});

test("unknown keys are ignored, not an error", () => {
  expect(parseConfig('{ "api": "http://x", "future": 1 }')).toEqual({ api: "http://x" });
});

test("malformed configs throw with a reason", () => {
  expect(() => parseConfig("[]")).toThrow("JSON object");
  expect(() => parseConfig('{ "api": 42 }')).toThrow("non-empty string");
  expect(() => parseConfig('{ "api": "" }')).toThrow("non-empty string");
  expect(() => parseConfig("not json")).toThrow();
});
