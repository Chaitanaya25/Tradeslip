import * as React from "react"
import { cn } from "@/lib/utils"

/** DESIGN.md §7 Card: white, 1px border, radius 8, padding 24, optional 1px shadow. */
function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      className={cn(
        "rounded-lg border border-border bg-surface p-6 text-text shadow-card",
        className
      )}
      {...props}
    />
  )
}

/** Header row: title left, link/action right, 20px below. */
function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn("mb-5 flex items-center justify-between gap-4", className)}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return <h2 data-slot="card-title" className={cn("text-h2", className)} {...props} />
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-content" className={className} {...props} />
}

/** Table cards: header separated by a divider, no inner padding on the table. */
function TableCard({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="table-card"
      className={cn(
        "overflow-hidden rounded-lg border border-border bg-surface text-text shadow-card",
        className
      )}
      {...props}
    />
  )
}

function TableCardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="table-card-header"
      className={cn(
        "flex items-center justify-between gap-4 border-b border-border px-6 py-5",
        className
      )}
      {...props}
    />
  )
}

/** Stat card: icon tile left, then label, value, sub-line. Padding 20. */
function StatCard({
  icon,
  label,
  value,
  sub,
  accentValue = true,
  className,
}: {
  icon: React.ReactNode
  label: string
  value: React.ReactNode
  sub?: React.ReactNode
  /** Money figures and the overdue count are accent; plain counts are text. */
  accentValue?: boolean
  className?: string
}) {
  return (
    <div
      data-slot="stat-card"
      className={cn(
        "flex items-start gap-4 rounded-lg border border-border bg-surface p-5 shadow-card",
        className
      )}
    >
      {icon}
      <div className="min-w-0">
        <div className="text-body text-text-muted">{label}</div>
        <div className={cn("text-stat tabular", accentValue ? "text-accent" : "text-text")}>
          {value}
        </div>
        {sub ? <div className="text-small text-text-muted">{sub}</div> : null}
      </div>
    </div>
  )
}

export { Card, CardHeader, CardTitle, CardContent, TableCard, TableCardHeader, StatCard }
