"use client"

import * as React from "react"
import { Switch as SwitchPrimitive } from "radix-ui"
import { cn } from "@/lib/utils"

/** DESIGN.md §7 toggle: 44x24, on = accent, off = #D6D3CD, white knob. */
function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer inline-flex h-6 w-11 shrink-0 items-center rounded-full border-0 p-0.5 transition-colors duration-150 outline-none",
        "data-[state=checked]:bg-accent data-[state=unchecked]:bg-border-strong",
        "focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block size-5 rounded-full bg-white transition-transform duration-150 data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
