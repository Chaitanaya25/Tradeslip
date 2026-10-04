import * as React from "react";
import { cn } from "@/lib/utils";

/** Multi-line input styled like Input: white, 1px border-strong, radius 8, accent focus ring. */
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "min-h-24 w-full rounded-lg border border-border-strong bg-surface px-3 py-2.5 text-[15px] leading-[22px] text-text transition-colors duration-150 outline-none placeholder:text-text-subtle",
        "focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/25 focus-visible:outline-none",
        "disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
