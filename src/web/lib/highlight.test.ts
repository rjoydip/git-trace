import { describe, it, expect, mock, beforeEach } from "bun:test";
import { languageFor, prismStyle, PrismLight } from "./highlight";
import { extensionOf } from "../../core/media";

beforeEach(() => {
  mock.fetch();
  mock.setInterval();
  mock.setTimeout();
  mock.Math.random();
});

describe("languageFor", () => {
  it("returns null for empty path", () => {
    expect(languageFor("")).toBeNull();
  });

  it("returns null for path without extension", () => {
    expect(languageFor("file")).toBeNull();
  });

  it("returns null for path with unknown extension", () => {
    expect(languageFor("file.unknown")).toBeNull();
  });

  it("returns grammar for path with known extension", () => {
    expect(languageFor("file.ts")).toBe("typescript");
  });

  it("returns grammar for path with known extension (case-insensitive)", () => {
    expect(languageFor("file.TS")).toBe("typescript");
  });

  it("returns null for null input", () => {
    expect(languageFor(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(languageFor(undefined)).toBeNull();
  });
});

describe("prismStyle", () => {
  it("returns oneDark for dark mode", () => {
    expect(prismStyle("dark")).toEqual(oneDark);
  });

  it("returns oneLight for light mode", () => {
    expect(prismStyle("light")).toEqual(oneLight);
  });

  it("returns oneLight for invalid input", () => {
    expect(prismStyle(null)).toEqual(oneLight);
    expect(prismStyle(undefined)).toEqual(oneLight);
    expect(prismStyle("invalid")).toEqual(oneLight);
  });
});

describe("PrismLight", () => {
  it("is defined", () => {
    expect(PrismLight).toBeDefined();
  });
});