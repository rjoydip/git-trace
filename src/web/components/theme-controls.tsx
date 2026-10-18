import { Check, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ACCENTS, setAccent, setMode, toggleMode, useAppearance } from "@/lib/theme";
import { cn } from "@/lib/utils";

/** Header control: flips dark/light. */
export function ThemeToggle() {
  const { mode } = useAppearance();
  const next = mode === "dark" ? "light" : "dark";

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={toggleMode}
      title={`Switch to ${next} theme`}
      aria-label={`Switch to ${next} theme`}
    >
      {mode === "dark" ? <Moon /> : <Sun />}
    </Button>
  );
}

const MODES = [
  { id: "dark", name: "Dark", icon: Moon },
  { id: "light", name: "Light", icon: Sun },
] as const;

/** Settings dialog body: theme mode plus the accent palette. */
export function AppearanceSettings() {
  const { mode, accentId } = useAppearance();

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <span className="block text-[11px] font-semibold text-zinc-300">Theme</span>
        <div className="grid grid-cols-2 gap-2">
          {MODES.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setMode(option.id)}
              aria-pressed={mode === option.id}
              className={cn(
                "flex items-center justify-center gap-2 rounded-xl border py-2 text-xs font-medium transition-all",
                mode === option.id
                  ? "border-indigo-500 bg-indigo-500/10 text-indigo-300"
                  : "border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200",
              )}
            >
              <option.icon className="size-3.5" />
              {option.name}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <span className="block text-[11px] font-semibold text-zinc-300">Accent colour</span>
        <div className="flex flex-wrap items-center justify-center gap-2 px-2 py-2">
          {ACCENTS.map((accent) => {
            const active = accent.id === accentId;
            return (
              <button
                key={accent.id}
                type="button"
                onClick={() => setAccent(accent.base)}
                title={accent.name}
                aria-label={accent.name}
                aria-pressed={active}
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full transition-transform hover:scale-110",
                  active
                    ? "ring-2 ring-zinc-100 ring-offset-2 ring-offset-zinc-950"
                    : "ring-1 ring-zinc-700 hover:ring-zinc-500",
                )}
                style={{ backgroundColor: accent.base }}
              >
                {active && <Check className="size-3 text-white drop-shadow" strokeWidth={3} />}
              </button>
            );
          })}
        </div>
        <p className="text-[11px] leading-relaxed text-zinc-500">
          Drives buttons, active tabs, links and focus rings across the whole interface.
        </p>
      </div>
    </div>
  );
}
