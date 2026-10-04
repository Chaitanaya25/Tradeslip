import * as React from "react"
import { cn } from "@/lib/utils"

/** DESIGN.md §7 Input: 44px, white, 1px border-strong, radius 8, 15px, accent focus ring. */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-11 w-full min-w-0 rounded-lg border border-border-strong bg-surface px-3 text-[15px] text-text transition-colors duration-150 outline-none placeholder:text-text-subtle",
        "focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/25 focus-visible:outline-none",
        "disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive",
        className
      )}
      {...props}
    />
  )
}

export { Input }
