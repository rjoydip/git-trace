/**
 * Serialises the little tables the dashboard can hand off — hot files, ranked
 * lists — into a shape a human or another tool can take away.
 */

export type ExportFormat = "json" | "markdown" | "csv" | "text";

export const EXPORT_FORMATS: ReadonlyArray<{
  id: ExportFormat;
  name: string;
  ext: string;
  mime: string;
}> = [
  { id: "json", name: "JSON", ext: "json", mime: "application/json" },
  { id: "markdown", name: "Markdown", ext: "md", mime: "text/markdown" },
  { id: "csv", name: "CSV", ext: "csv", mime: "text/csv" },
  { id: "text", name: "Text", ext: "txt", mime: "text/plain" },
];

export function formatPreset(format: ExportFormat): (typeof EXPORT_FORMATS)[number] {
  return EXPORT_FORMATS.find((f) => f.id === format) ?? EXPORT_FORMATS[0]!;
}

/** Clipboard, but a denied permission is a `false`, not a rejected promise. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Hands the text to the browser as a file download. */
export function downloadText(filename: string, text: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** RFC 4180: quote when the value carries a delimiter, a quote or a newline. */
export function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function columnsOf(rows: Array<Record<string, unknown>>): string[] {
  return rows.length === 0 ? [] : Object.keys(rows[0] as Record<string, unknown>);
}

/** One table, four shapes. Column order follows the first record. */
export function serializeRows(rows: Array<Record<string, unknown>>, format: ExportFormat): string {
  if (rows.length === 0) return format === "json" ? "[]\n" : "";
  const columns = columnsOf(rows);

  if (format === "json") return `${JSON.stringify(rows, null, 2)}\n`;

  if (format === "csv") {
    return [
      columns.map(csvCell).join(","),
      ...rows.map((r) => columns.map((c) => csvCell(r[c])).join(",")),
    ]
      .join("\n")
      .concat("\n");
  }

  if (format === "markdown") {
    const head = `| ${columns.join(" | ")} |`;
    const rule = `| ${columns.map(() => "---").join(" | ")} |`;
    const body = rows.map(
      (r) => `| ${columns.map((c) => String(r[c] ?? "").replace(/\|/g, "\\|")).join(" | ")} |`,
    );
    return [head, rule, ...body].join("\n").concat("\n");
  }

  return rows
    .map((r) => columns.map((c) => `${c}: ${r[c] ?? ""}`).join("\n"))
    .join("\n\n")
    .concat("\n");
}
