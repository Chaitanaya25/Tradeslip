import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"
import { cn } from "@/lib/utils"

/**
 * DESIGN.md §7 Button.
 * primary / secondary: 44px (compact 40px), 15/600, radius 8, padding 0 20px.
 * outline-accent: 36px, 13/500. ghost: accent link-style (add a trailing arrow).
 * icon: 44x44 secondary square.
 */
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-transparent transition-colors duration-150 ease-out select-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5",
  {
    variants: {
      variant: {
        primary:
          "bg-accent px-5 text-[15px] leading-[22px] font-semibold text-white hover:bg-accent-hover",
        secondary:
          "border-border-strong bg-surface px-5 text-[15px] leading-[22px] font-semibold text-text hover:bg-surface-muted",
        "outline-accent":
          "border-accent bg-surface px-3.5 text-[13px] leading-[18px] font-medium text-accent hover:bg-accent-soft [&_svg:not([class*='size-'])]:size-4",
        ghost:
          "gap-1 rounded-md px-0 text-[15px] leading-[22px] font-medium text-accent hover:text-accent-hover [&_svg:not([class*='size-'])]:size-4",
        icon: "border-border-strong bg-surface text-text hover:bg-surface-muted",
      },
      size: {
        default: "h-11",
        compact: "h-10",
      },
    },
    compoundVariants: [
      { variant: "outline-accent", className: "h-9" },
      { variant: "ghost", className: "h-auto" },
      { variant: "icon", className: "size-11 px-0" },
    ],
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  }
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant ?? "primary"}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
}

export { Button, buttonVariants }
