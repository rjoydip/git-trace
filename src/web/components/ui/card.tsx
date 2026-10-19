import * as React from "react";
import { cn } from "@/lib/utils";

function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      className={cn(
        "glass-panel-interactive text-card-foreground flex flex-col gap-4 rounded-2xl p-5",
        className,
      )}
      {...props}
    />
  );
}

export { Card };
