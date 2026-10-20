import { createContext, useContext, useState } from "react";
import {
  Check,
  CircleAlert,
  Code2,
  Copy,
  Eye,
  Info,
  Lightbulb,
  OctagonAlert,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppearance } from "@/lib/theme";
import {
  parseMarkdown,
  pickPictureSource,
  resolveUrl,
  type CalloutKind,
  type MdBlock,
  type MdInline,
} from "@/lib/markdown";

const LINK_CLASS =
  "text-cyan-400 underline decoration-cyan-400/40 underline-offset-2 hover:decoration-cyan-400";

/** README logos often ship light/dark variants; the site theme chooses one. */
const ModeContext = createContext<"dark" | "light">("dark");

const CALLOUTS: Record<
  CalloutKind,
  { label: string; icon: LucideIcon; box: string; title: string }
> = {
  note: {
    label: "Note",
    icon: Info,
    box: "border-sky-500/50 bg-sky-500/10",
    title: "text-sky-400",
  },
  tip: {
    label: "Tip",
    icon: Lightbulb,
    box: "border-emerald-500/50 bg-emerald-500/10",
    title: "text-emerald-400",
  },
  important: {
    label: "Important",
    icon: CircleAlert,
    box: "border-violet-500/50 bg-violet-500/10",
    title: "text-violet-400",
  },
  warning: {
    label: "Warning",
    icon: TriangleAlert,
    box: "border-amber-500/50 bg-amber-500/10",
    title: "text-amber-400",
  },
  caution: {
    label: "Caution",
    icon: OctagonAlert,
    box: "border-rose-500/50 bg-rose-500/10",
    title: "text-rose-400",
  },
};

function InlinePart({
  part,
  baseUrl,
  imageBaseUrl,
}: {
  part: MdInline;
  baseUrl?: string;
  imageBaseUrl?: string;
}) {
  const mode = useContext(ModeContext);
  switch (part.type) {
    case "code":
      return (
        <code className="rounded bg-zinc-800/80 px-1 py-0.5 font-mono text-[11px] text-cyan-300">
          {part.text}
        </code>
      );
    case "strong":
      return (
        <strong className="font-semibold text-zinc-100">
          <Inlines parts={part.children} baseUrl={baseUrl} imageBaseUrl={imageBaseUrl} />
        </strong>
      );
    case "em":
      return (
        <em className="italic">
          <Inlines parts={part.children} baseUrl={baseUrl} imageBaseUrl={imageBaseUrl} />
        </em>
      );
    case "strike":
      return (
        <del className="text-zinc-400 line-through">
          <Inlines parts={part.children} baseUrl={baseUrl} imageBaseUrl={imageBaseUrl} />
        </del>
      );
    case "link":
      if (!part.href) {
        return <Inlines parts={part.children} baseUrl={baseUrl} imageBaseUrl={imageBaseUrl} />;
      }
      return (
        <a
          href={resolveUrl(part.href, baseUrl)}
          title={part.title}
          target="_blank"
          rel="noreferrer noopener"
          className={LINK_CLASS}
        >
          <Inlines parts={part.children} baseUrl={baseUrl} imageBaseUrl={imageBaseUrl} />
        </a>
      );
    case "image":
      if (!part.src) return <>{part.alt}</>;
      return (
        <img
          src={resolveUrl(part.src, imageBaseUrl ?? baseUrl)}
          alt={part.alt}
          title={part.title}
          loading="lazy"
          className="my-1 inline-block max-w-full rounded-lg border border-zinc-800"
        />
      );
    case "picture": {
      const src = pickPictureSource(part, mode);
      if (!src) return <>{part.image.alt}</>;
      return (
        <img
          src={resolveUrl(src, imageBaseUrl ?? baseUrl)}
          alt={part.image.alt}
          title={part.image.title}
          loading="lazy"
          className="my-1 inline-block max-w-full rounded-lg border border-zinc-800"
        />
      );
    }
    case "br":
      return <br />;
    case "kbd":
      return (
        <kbd className="rounded border border-zinc-700 bg-zinc-800 px-1 py-0.5 font-mono text-[10px] text-zinc-200">
          {part.text}
        </kbd>
      );
    case "sub":
      return <sub>{part.text}</sub>;
    case "sup":
      return <sup>{part.text}</sup>;
    default:
      return <>{part.text}</>;
  }
}

function Inlines({
  parts,
  baseUrl,
  imageBaseUrl,
}: {
  parts: MdInline[];
  baseUrl?: string;
  imageBaseUrl?: string;
}) {
  return (
    <>
      {parts.map((part, index) => (
        <InlinePart key={index} part={part} baseUrl={baseUrl} imageBaseUrl={imageBaseUrl} />
      ))}
    </>
  );
}

function Blocks({
  blocks,
  baseUrl,
  imageBaseUrl,
}: {
  blocks: MdBlock[];
  baseUrl?: string;
  imageBaseUrl?: string;
}) {
  return (
    <>
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          const sizes = ["text-base", "text-sm", "text-xs", "text-xs", "text-xs", "text-xs"];
          const Tag = (["h1", "h2", "h3", "h4", "h5", "h6"] as const)[block.level - 1] ?? "p";
          return (
            <Tag
              key={index}
              className={cn("font-semibold text-zinc-100", sizes[block.level - 1] ?? "text-xs")}
            >
              <Inlines parts={block.children} baseUrl={baseUrl} imageBaseUrl={imageBaseUrl} />
            </Tag>
          );
        }
        if (block.type === "code")
          return (
            <pre
              key={index}
              className="overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950 p-3 font-mono text-[11px] leading-relaxed text-emerald-400"
            >
              {block.text}
            </pre>
          );
        if (block.type === "quote") {
          if (block.kind) {
            const callout = CALLOUTS[block.kind];
            const Icon = callout.icon;
            return (
              <div key={index} className={cn("rounded-lg border-l-2 px-3 py-2", callout.box)}>
                <p
                  className={cn(
                    "mb-1 flex items-center gap-1.5 text-[11px] font-semibold",
                    callout.title,
                  )}
                >
                  <Icon className="size-3.5" />
                  {callout.label}
                </p>
                <div className="space-y-1 text-zinc-300">
                  <Blocks blocks={block.blocks} baseUrl={baseUrl} imageBaseUrl={imageBaseUrl} />
                </div>
              </div>
            );
          }
          return (
            <blockquote
              key={index}
              className="space-y-1 border-l-2 border-zinc-700 pl-3 text-zinc-400"
            >
              <Blocks blocks={block.blocks} baseUrl={baseUrl} imageBaseUrl={imageBaseUrl} />
            </blockquote>
          );
        }
        if (block.type === "rule") return <hr key={index} className="border-zinc-800" />;
        if (block.type === "list") {
          const className = cn("space-y-1 pl-5", block.ordered ? "list-decimal" : "list-disc");
          const items = block.items.map((item, itemIndex) => (
            <li key={itemIndex} className={item.task ? "list-none" : undefined}>
              {item.task && (
                <input
                  type="checkbox"
                  checked={item.task === "checked"}
                  readOnly
                  tabIndex={-1}
                  className="mr-1.5 size-3 translate-y-px accent-cyan-500"
                />
              )}
              <Blocks blocks={item.blocks} baseUrl={baseUrl} imageBaseUrl={imageBaseUrl} />
            </li>
          ));
          return block.ordered ? (
            <ol key={index} start={block.start} className={className}>
              {items}
            </ol>
          ) : (
            <ul key={index} className={className}>
              {items}
            </ul>
          );
        }
        if (block.type === "table") {
          const cell = "border border-zinc-800 px-2 py-1 align-top";
          return (
            <div key={index} className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-[11px]">
                <thead>
                  <tr>
                    {block.header.map((part, cellIndex) => (
                      <th
                        key={cellIndex}
                        style={{ textAlign: block.align[cellIndex] ?? undefined }}
                        className={cn(cell, "bg-zinc-950/60 font-semibold text-zinc-200")}
                      >
                        <Inlines parts={part} baseUrl={baseUrl} imageBaseUrl={imageBaseUrl} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {row.map((part, cellIndex) => (
                        <td
                          key={cellIndex}
                          style={{ textAlign: block.align[cellIndex] ?? undefined }}
                          className={cell}
                        >
                          <Inlines parts={part} baseUrl={baseUrl} imageBaseUrl={imageBaseUrl} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        if (block.type === "details")
          return (
            <details
              key={index}
              open={block.open || undefined}
              className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2"
            >
              <summary className="cursor-pointer text-[11px] font-medium text-zinc-200 marker:text-zinc-500">
                <Inlines parts={block.summary} baseUrl={baseUrl} imageBaseUrl={imageBaseUrl} />
              </summary>
              <div className="space-y-2 pt-2">
                <Blocks blocks={block.blocks} baseUrl={baseUrl} imageBaseUrl={imageBaseUrl} />
              </div>
            </details>
          );
        if (block.type === "html")
          return (
            <div
              key={index}
              className={cn(
                "space-y-2",
                block.align === "center" && "text-center",
                block.align === "right" && "text-right",
              )}
            >
              <Blocks blocks={block.blocks} baseUrl={baseUrl} imageBaseUrl={imageBaseUrl} />
            </div>
          );
        return (
          <p key={index} className="whitespace-pre-wrap">
            <Inlines parts={block.children} baseUrl={baseUrl} imageBaseUrl={imageBaseUrl} />
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
 * Relative links and images resolve against `baseUrl` / `imageBaseUrl` — pass
 * the file's GitHub URL so a README's `./docs/x.md` stays clickable.
 */
export function MarkdownBody({
  text,
  className,
  fill = false,
  baseUrl,
  imageBaseUrl,
}: {
  text: string;
  className?: string;
  fill?: boolean;
  baseUrl?: string;
  imageBaseUrl?: string;
}) {
  const [raw, setRaw] = useState(false);
  const [copied, setCopied] = useState(false);
  const { mode } = useAppearance();
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
    <ModeContext.Provider value={mode}>
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
              fill
                ? "min-h-0 flex-1 space-y-2 overflow-auto"
                : "max-h-80 space-y-2 overflow-y-auto",
            )}
          >
            <Blocks blocks={blocks} baseUrl={baseUrl} imageBaseUrl={imageBaseUrl} />
          </div>
        )}
      </div>
    </ModeContext.Provider>
  );
}
