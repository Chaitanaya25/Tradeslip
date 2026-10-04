import * as React from "react"
import { cn } from "@/lib/utils"

/** DESIGN.md §2 status colours. Pills only: soft bg + darker text, no border. */
const STATUS_STYLES = {
  accepted: { label: "Accepted", className: "bg-status-good-bg text-status-good-text" },
  paid: { label: "Paid", className: "bg-status-good-bg text-status-good-text" },
  viewed: { label: "Viewed", className: "bg-status-info-bg text-status-info-text" },
  sent: { label: "Sent", className: "bg-status-neutral-bg text-status-neutral-text" },
  draft: { label: "Draft", className: "bg-status-neutral-bg text-status-neutral-text" },
  awaiting: { label: "Awaiting reply", className: "bg-status-warn-bg text-status-warn-text" },
  overdue: { label: "Overdue", className: "bg-status-bad-bg text-status-bad-text" },
  declined: { label: "Declined", className: "bg-status-bad-bg text-status-bad-text" },
  expired: { label: "Expired", className: "bg-status-neutral-bg text-status-expired-text" },
} as const

export type Status = keyof typeof STATUS_STYLES

export const STATUSES = Object.keys(STATUS_STYLES) as Status[]

function StatusPill({
  status,
  children,
  className,
}: {
  status: Status
  /** Override the label (e.g. a dotted Draft pill). Defaults to the status label. */
  children?: React.ReactNode
  className?: string
}) {
  const style = STATUS_STYLES[status]
  return (
    <span
      data-slot="status-pill"
      data-status={status}
      className={cn(
        "inline-flex h-[26px] items-center rounded-sm px-2.5 text-[13px] leading-[18px] font-medium whitespace-nowrap",
        style.className,
        className
      )}
    >
      {children ?? style.label}
    </span>
  )
}

export { StatusPill }
