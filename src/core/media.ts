/**
 * Content types for one repository path, used by the raw-bytes endpoint.
 *
 * This is the only thing standing between a repository's file and the browser's
 * content sniffing, so the default is opaque bytes and only real media is
 * allowed to render in place — a repository's HTML must never execute on this
 * origin, however it is opened.
 */

const IMAGE: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  bmp: "image/bmp",
  ico: "image/x-icon",
  svg: "image/svg+xml",
};

const VIDEO: Record<string, string> = {
  mp4: "video/mp4",
  m4v: "video/mp4",
  webm: "video/webm",
  ogv: "video/ogg",
  mov: "video/quicktime",
};

const AUDIO: Record<string, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  m4a: "audio/mp4",
  flac: "audio/flac",
};

const DOCUMENT: Record<string, string> = { pdf: "application/pdf" };

/** Lower-case extension without the dot, or "" for a dotfile or no extension. */
export function extensionOf(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? "" : name.slice(dot + 1).toLowerCase();
}

/** The MIME type to serve a path as. Unknown extensions are opaque bytes. */
export function mediaType(path: string): string {
  const ext = extensionOf(path);
  return IMAGE[ext] ?? VIDEO[ext] ?? AUDIO[ext] ?? DOCUMENT[ext] ?? "application/octet-stream";
}

/** Whether the browser may render this type in place rather than download it. */
export function isInlineMedia(type: string): boolean {
  return /^(image|video|audio)\//.test(type) || type === "application/pdf";
}
