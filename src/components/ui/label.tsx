"use client"

import * as React from "react"
import { Label as LabelPrimitive } from "radix-ui"
import { cn } from "@/lib/utils"

/** Form label: 13/500 muted, 6px gap above the field. */
function Label({ className, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        "mb-1.5 block text-[13px] leading-[18px] font-medium text-text-muted select-none",
        className
      )}
      {...props}
    />
  )
}

export { Label }
