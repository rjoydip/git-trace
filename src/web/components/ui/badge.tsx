import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex w-fit items-center gap-1 rounded border px-2 py-0.5 font-mono text-[10px] font-medium whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "border-indigo-500/20 bg-indigo-500/10 text-indigo-400",
        primary: "border-transparent bg-indigo-600 text-white",
        secondary: "border-zinc-800 bg-zinc-900 text-zinc-400",
        outline: "border-zinc-800 text-zinc-400",
        success: "border-emerald-500/20 bg-emerald-500/10 text-emerald-400",
        warning: "border-amber-500/20 bg-amber-500/10 text-amber-400",
        info: "border-cyan-500/20 bg-cyan-500/10 text-cyan-400",
        destructive: "border-rose-500/20 bg-rose-500/10 text-rose-400",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span data-slot="badge" className={cn(badgeVariants({ variant, className }))} {...props} />
  );
}

export { Badge, badgeVariants };
