import { describe, expect, test } from "bun:test";
import { classifyPath } from "./paths";

describe("classifyPath", () => {
  test("buckets by extension", () => {
    expect(classifyPath("src/core/service.ts")).toBe("code");
    expect(classifyPath("src/web/App.tsx")).toBe("code");
    expect(classifyPath("README.md")).toBe("docs");
    expect(classifyPath("docs/guide/install.mdx")).toBe("docs");
    expect(classifyPath("package.json")).toBe("config");
    expect(classifyPath(".github/workflows/ci.yml")).toBe("config");
  });

  test("handles extensionless names, hidden files and odd paths", () => {
    expect(classifyPath("Dockerfile")).toBe("config");
    expect(classifyPath("LICENSE")).toBe("config");
    expect(classifyPath("Makefile")).toBe("config");
    expect(classifyPath("bin/run")).toBe("other");
    expect(classifyPath(".env")).toBe("other");
    expect(classifyPath("archive.tar.gz")).toBe("other");
    expect(classifyPath("")).toBe("other");
  });
});
