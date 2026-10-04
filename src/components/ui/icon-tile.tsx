import * as React from "react"
import { cn } from "@/lib/utils"

/** 40x40, radius 8 icon tile. `red` is for overdue items. Icons inherit colour. */
function IconTile({
  children,
  variant = "default",
  className,
}: {
  children: React.ReactNode
  variant?: "default" | "red"
  className?: string
}) {
  return (
    <div
      data-slot="icon-tile"
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-lg [&_svg]:size-5 [&_svg]:stroke-[1.5]",
        variant === "red"
          ? "bg-status-bad-bg text-status-bad-text"
          : "bg-surface-muted text-text",
        className
      )}
    >
      {children}
    </div>
  )
}

export { IconTile }
