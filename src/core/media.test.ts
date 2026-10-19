import { describe, expect, test } from "bun:test";
import { extensionOf, isInlineMedia, mediaType } from "./media";

describe("extensionOf", () => {
  test("returns the lower-case extension", () => {
    expect(extensionOf("src/web/App.TSX")).toBe("tsx");
    expect(extensionOf("logo.png")).toBe("png");
  });

  test("returns nothing for a dotfile or an extensionless name", () => {
    expect(extensionOf(".gitignore")).toBe("");
    expect(extensionOf("LICENSE")).toBe("");
    expect(extensionOf("Makefile")).toBe("");
  });

  test("reads the extension after the last dot in the file name only", () => {
    expect(extensionOf("docs/v1.2/notes.md")).toBe("md");
    expect(extensionOf("archive.tar.gz")).toBe("gz");
  });
});

describe("mediaType", () => {
  test("maps the media the dashboard renders", () => {
    expect(mediaType("assets/logo.png")).toBe("image/png");
    expect(mediaType("a.svg")).toBe("image/svg+xml");
    expect(mediaType("demo.mp4")).toBe("video/mp4");
    expect(mediaType("voice.mp3")).toBe("audio/mpeg");
    expect(mediaType("paper.pdf")).toBe("application/pdf");
  });

  test("treats anything else as opaque bytes", () => {
    expect(mediaType("index.html")).toBe("application/octet-stream");
    expect(mediaType("src/core/github.ts")).toBe("application/octet-stream");
    expect(mediaType("LICENSE")).toBe("application/octet-stream");
  });
});

describe("isInlineMedia", () => {
  test("renders media and PDFs in place", () => {
    expect(isInlineMedia(mediaType("a.png"))).toBe(true);
    expect(isInlineMedia(mediaType("a.mp4"))).toBe(true);
    expect(isInlineMedia(mediaType("a.pdf"))).toBe(true);
  });

  test("downloads everything else, so no repository file executes here", () => {
    expect(isInlineMedia(mediaType("index.html"))).toBe(false);
    expect(isInlineMedia(mediaType("script.js"))).toBe(false);
    expect(isInlineMedia(mediaType("README.md"))).toBe(false);
  });
});
