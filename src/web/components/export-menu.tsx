/**
 * The copy/download control the dashboard's ranked tables share: pick a shape
 * (JSON, Markdown, CSV, text), copy it, or download it as a file.
 */
import { useState } from "react";
import { Check, Copy, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { copyText, downloadText, EXPORT_FORMATS, formatPreset, serializeRows } from "@/lib/export";
import type { ExportFormat } from "@/lib/export";

export function ExportMenu({
  rows,
  filename,
  disabled = false,
}: {
  /** Records to hand off — column order follows the first one. */
  rows: Array<Record<string, unknown>>;
  /** Download name without the extension. */
  filename: string;
  disabled?: boolean;
}) {
  const [format, setFormat] = useState<ExportFormat>("json");
  const [copied, setCopied] = useState(false);
  const preset = formatPreset(format);
  const empty = disabled || rows.length === 0;

  return (
    <div className="flex items-center gap-2">
      <Select value={format} onValueChange={(next) => setFormat(next as ExportFormat)}>
        <SelectTrigger className="h-7 w-28 font-mono text-[11px]" aria-label="Export format">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {EXPORT_FORMATS.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button
        variant="outline"
        size="xs"
        disabled={empty}
        onClick={() => {
          void copyText(serializeRows(rows, format)).then((ok) => {
            if (!ok) return;
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2000);
          });
        }}
      >
        {copied ? <Check /> : <Copy />} Copy
      </Button>

      <Button
        variant="outline"
        size="xs"
        disabled={empty}
        onClick={() =>
          downloadText(`${filename}.${preset.ext}`, serializeRows(rows, format), preset.mime)
        }
      >
        <Download /> .{preset.ext}
      </Button>
    </div>
  );
}
