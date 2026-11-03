import { expect, test } from "bun:test";
import { detectAuth, loginHint, TOKEN_URL, type GhProbe } from "../src/cli/auth";

const probe = (result: GhProbe) => () => result;

test("an explicit token wins without probing gh", () => {
  let probes = 0;
  const auth = detectAuth("  abc  ", {}, () => {
    probes += 1;
    return { state: "missing" };
  });
  expect(auth).toEqual({ token: "abc", source: "--token" });
  expect(probes).toBe(0);
});

test("GITHUB_TOKEN then GH_TOKEN, trimmed", () => {
  expect(detectAuth(undefined, { GITHUB_TOKEN: " a ", GH_TOKEN: "b" })).toEqual({
    token: "a",
    source: "GITHUB_TOKEN",
  });
  expect(detectAuth(undefined, { GITHUB_TOKEN: "  ", GH_TOKEN: " b " })).toEqual({
    token: "b",
    source: "GH_TOKEN",
  });
});

test("the gh credential store is the last source", () => {
  const auth = detectAuth(undefined, {}, probe({ state: "authenticated", token: "gho_x" }));
  expect(auth).toEqual({ token: "gho_x", source: "gh", gh: "authenticated" });
});

test("gh installed but signed out is its own state", () => {
  expect(detectAuth(undefined, {}, probe({ state: "unauthenticated" }))).toEqual({
    gh: "unauthenticated",
  });
});

test("no gh at all is reported as missing", () => {
  expect(detectAuth(undefined, {}, probe({ state: "missing" }))).toEqual({ gh: "missing" });
});

test("the hint names gh's own login when gh is installed", () => {
  expect(loginHint({ gh: "unauthenticated" })).toContain("gh auth login");
});

test("the hint falls back to the token page", () => {
  expect(loginHint({ gh: "missing" })).toContain(TOKEN_URL);
  expect(TOKEN_URL.startsWith("https://github.com/settings/tokens/new")).toBe(true);
});
