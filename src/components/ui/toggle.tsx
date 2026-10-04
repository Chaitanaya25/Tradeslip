"use client"

import * as React from "react"
import { Switch } from "@/components/ui/switch"

/** Switch + label (15/500) + description (13 muted) beneath. */
function Toggle({
  id,
  label,
  description,
  ...props
}: React.ComponentProps<typeof Switch> & { id: string; label: string; description?: string }) {
  const descId = description ? `${id}-desc` : undefined
  return (
    <div className="flex items-start gap-3">
      <Switch id={id} aria-describedby={descId} {...props} />
      <div>
        <label htmlFor={id} className="text-body-strong block cursor-pointer">
          {label}
        </label>
        {description ? (
          <p id={descId} className="text-small text-text-muted">
            {description}
          </p>
        ) : null}
      </div>
    </div>
  )
}

export { Toggle }
