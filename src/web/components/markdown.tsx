/**
 * A deliberately small Markdown reader for commit messages, pull-request bodies
 * and comments.
 *
 * ponytail: no tables, nested lists, images or footnotes — this covers what
 * GitHub prose actually uses in a trace. Swap in `marked` + a sanitizer if the
 * dashboard ever needs the full spec. Parsing is separate from rendering so the
 * grammar can be tested without a DOM, and nothing here touches
 * `dangerouslySetInnerHTML`.
 */
import { useState } from "react";
import { Check, Code2, Copy, Eye } from "lucide-react";
import { cn } from "@/lib/utils";

type MdInline =
  | { type: "text"; text: string }
  | { type: "code"; text: string }
  | { type: "strong"; text: string }
  | { type: "em"; text: string }
  | { type: "link"; text: string; href: string };

type MdBlock =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; text: string }
  | { type: "code"; lang: string; text: string }
  | { type: "quote"; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "rule" };

const FENCE = /^\s*```(\w*)\s*$/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const RULE = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
const QUOTE = /^\s*>\s?(.*)$/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const ORDERED = /^\s*\d+[.)]\s+(.*)$/;

/** Inline spans: `code`, **bold**, *italic*, [label](url). Links may not nest. */
export function parseInline(source: string): MdInline[] {
  const out: MdInline[] = [];
  const pattern =
    /`([^`]+)`|\*\*([^*]+)\*\*|__([^_]+)__|\*([^*\n]+)\*|_([^_\n]+)_|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;

  for (let match = pattern.exec(source); match; match = pattern.exec(source)) {
    if (match.index > last) out.push({ type: "text", text: source.slice(last, match.index) });
    const [, code, bold, boldAlt, em, emAlt, link, href] = match;
    if (code !== undefined) out.push({ type: "code", text: code });
    else if (bold !== undefined || boldAlt !== undefined)
      out.push({ type: "strong", text: bold ?? boldAlt ?? "" });
    else if (em !== undefined || emAlt !== undefined)
      out.push({ type: "em", text: em ?? emAlt ?? "" });
    else if (link !== undefined && href !== undefined) out.push({ type: "link", text: link, href });
    last = pattern.lastIndex;
  }

  if (last < source.length) out.push({ type: "text", text: source.slice(last) });
  return out;
}

/** Block structure of a Markdown document. */
export function parseMarkdown(source: string): MdBlock[] {
  const blocks: MdBlock[] = [];
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";

    if (!line.trim()) {
      index += 1;
      continue;
    }

    const fence = FENCE.exec(line);
    if (fence) {
      const body: string[] = [];
      index += 1;
      while (index < lines.length && !FENCE.test(lines[index] ?? "")) {
        body.push(lines[index] ?? "");
        index += 1;
      }
      index += 1;
      blocks.push({ type: "code", lang: fence[1] ?? "", text: body.join("\n") });
      continue;
    }

    if (RULE.test(line)) {
      blocks.push({ type: "rule" });
      index += 1;
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading?.[1] && heading[2] !== undefined) {
      blocks.push({ type: "heading", level: heading[1].length, text: heading[2].trim() });
      index += 1;
      continue;
    }

    const quote = QUOTE.exec(line);
    if (quote) {
      const body: string[] = [];
      while (index < lines.length) {
        const next = QUOTE.exec(lines[index] ?? "");
        if (!next) break;
        body.push(next[1] ?? "");
        index += 1;
      }
      blocks.push({ type: "quote", text: body.join("\n").trim() });
      continue;
    }

    const bullet = BULLET.exec(line);
    const ordered = ORDERED.exec(line);
    if (bullet?.[1] !== undefined || ordered?.[1] !== undefined) {
      const isOrdered = ordered?.[1] !== undefined;
      const items: string[] = [];
      while (index < lines.length) {
        const next = isOrdered ? ORDERED.exec(lines[index] ?? "") : BULLET.exec(lines[index] ?? "");
        if (next?.[1] === undefined) break;
        items.push(next[1]);
        index += 1;
      }
      blocks.push({ type: "list", ordered: isOrdered, items });
      continue;
    }

    // Anything else runs until a blank line or the start of another block.
    const body: string[] = [];
    while (index < lines.length) {
      const next = lines[index] ?? "";
      if (!next.trim() || FENCE.test(next) || RULE.test(next) || HEADING.test(next)) break;
      if (QUOTE.test(next) || BULLET.test(next) || ORDERED.test(next)) break;
      body.push(next.trim());
      index += 1;
    }
    blocks.push({ type: "paragraph", text: body.join(" ") });
  }

  return blocks;
}

function Inline({ source }: { source: string }) {
  return (
    <>
      {parseInline(source).map((part, i) => {
        if (part.type === "code")
          return (
            <code
              key={i}
              className="rounded bg-zinc-800/80 px-1 py-0.5 font-mono text-[11px] text-cyan-300"
            >
              {part.text}
            </code>
          );
        if (part.type === "strong")
          return (
            <strong key={i} className="font-semibold text-zinc-100">
              {part.text}
            </strong>
          );
        if (part.type === "em")
          return (
            <em key={i} className="italic">
              {part.text}
            </em>
          );
        if (part.type === "link")
          return (
            <a
              key={i}
              href={part.href}
              target="_blank"
              rel="noreferrer noopener"
              className="text-cyan-400 underline decoration-cyan-400/40 underline-offset-2 hover:decoration-cyan-400"
            >
              {part.text}
            </a>
          );
        return <span key={i}>{part.text}</span>;
      })}
    </>
  );
}

function Blocks({ blocks }: { blocks: MdBlock[] }) {
  return (
    <>
      {blocks.map((block, i) => {
        if (block.type === "heading") {
          const sizes = ["text-base", "text-sm", "text-xs", "text-xs", "text-xs", "text-xs"];
          return (
            <p
              key={i}
              className={cn("font-semibold text-zinc-100", sizes[block.level - 1] ?? "text-xs")}
            >
              <Inline source={block.text} />
            </p>
          );
        }
        if (block.type === "code")
          return (
            <pre
              key={i}
              className="overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950 p-3 font-mono text-[11px] leading-relaxed text-emerald-400"
            >
              {block.text}
            </pre>
          );
        if (block.type === "quote")
          return (
            <blockquote key={i} className="border-l-2 border-zinc-700 pl-3 text-zinc-400 italic">
              <Inline source={block.text} />
            </blockquote>
          );
        if (block.type === "rule") return <hr key={i} className="border-zinc-800" />;
        if (block.type === "list") {
          const Tag = block.ordered ? "ol" : "ul";
          return (
            <Tag
              key={i}
              className={cn("space-y-1 pl-5", block.ordered ? "list-decimal" : "list-disc")}
            >
              {block.items.map((item, j) => (
                <li key={j}>
                  <Inline source={item} />
                </li>
              ))}
            </Tag>
          );
        }
        return (
          <p key={i} className="whitespace-pre-wrap">
            <Inline source={block.text} />
          </p>
        );
      })}
    </>
  );
}

/**
 * Markdown prose with a rendered/raw switch and a copy-the-source action. Raw is
 * the exact text GitHub served — what a reader pastes elsewhere.
 *
 * `fill` stretches the reader to its parent's height and scrolls inside it; the
 * default caps at 20rem, which is right for a comment and wrong for a file pane.
 */
export function MarkdownBody({
  text,
  className,
  fill = false,
}: {
  text: string;
  className?: string;
  fill?: boolean;
}) {
  const [raw, setRaw] = useState(false);
  const [copied, setCopied] = useState(false);
  const blocks = parseMarkdown(text);

  const copy = () => {
    void navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => setCopied(false));
  };

  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-xl border border-zinc-800/60 bg-zinc-900/40 p-3",
        fill && "h-full min-h-0",
        className,
      )}
    >
      <div className="flex flex-none items-center justify-between gap-2">
        <div className="flex rounded-lg border border-zinc-800 bg-zinc-950 p-0.5">
          {[
            { id: false, label: "Rendered", icon: Eye },
            { id: true, label: "Raw", icon: Code2 },
          ].map((option) => (
            <button
              key={option.label}
              type="button"
              aria-pressed={raw === option.id}
              onClick={() => setRaw(option.id)}
              className={cn(
                "flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-[10px] transition-colors",
                raw === option.id
                  ? "bg-zinc-800 text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-300",
              )}
            >
              <option.icon className="size-3" />
              {option.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={copy}
          className="flex items-center gap-1 font-mono text-[10px] text-zinc-500 transition-colors hover:text-zinc-200"
        >
          {copied ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
          {copied ? "Copied" : "Copy raw"}
        </button>
      </div>

      {raw ? (
        <pre
          className={cn(
            "font-mono text-[11px] leading-relaxed break-words whitespace-pre-wrap text-zinc-400",
            fill ? "min-h-0 flex-1 overflow-auto" : "max-h-80 overflow-y-auto",
          )}
        >
          {text}
        </pre>
      ) : (
        <div
          className={cn(
            "text-xs leading-relaxed text-zinc-300",
            fill ? "min-h-0 flex-1 space-y-2 overflow-auto" : "max-h-80 space-y-2 overflow-y-auto",
          )}
        >
          <Blocks blocks={blocks} />
        </div>
      )}
    </div>
  );
}
