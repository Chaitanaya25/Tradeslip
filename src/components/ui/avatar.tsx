"use client"

import * as React from "react"
import { Avatar as AvatarPrimitive } from "radix-ui"
import { cn } from "@/lib/utils"

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return ""
  const first = parts[0][0]
  const last = parts.length > 1 ? parts[parts.length - 1][0] : ""
  return (first + last).toUpperCase()
}

/** Round avatar showing initials on surface-muted (or an image when `src` is given). */
function Avatar({
  name,
  src,
  className,
}: {
  name: string
  src?: string
  className?: string
}) {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      className={cn("relative flex size-11 shrink-0 overflow-hidden rounded-full", className)}
    >
      {src ? (
        <AvatarPrimitive.Image src={src} alt={name} className="size-full object-cover" />
      ) : null}
      <AvatarPrimitive.Fallback
        aria-label={name}
        className="flex size-full items-center justify-center bg-surface-muted text-[15px] font-medium text-text-muted"
      >
        {initialsOf(name)}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  )
}

export { Avatar, initialsOf }
