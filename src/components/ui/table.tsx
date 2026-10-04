"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

/**
 * DESIGN.md §7 Table: header row surface-muted 13/500 muted at 44px; rows 64px
 * with a two-line customer cell; 1px dividers; row hover #FCFBF9. Amounts are
 * right-aligned and tabular (use `numeric` on TableHead/TableCell).
 */
function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div data-slot="table-container" className="relative w-full overflow-x-auto">
      <table data-slot="table" className={cn("w-full text-[15px]", className)} {...props} />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead data-slot="table-header" className={cn("bg-surface-muted", className)} {...props} />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody data-slot="table-body" className={cn("[&_tr:last-child]:border-b-0", className)} {...props} />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "h-16 border-b border-border transition-colors duration-150 hover:bg-row-hover",
        className
      )}
      {...props}
    />
  )
}

function TableHead({
  className,
  numeric,
  ...props
}: React.ComponentProps<"th"> & { numeric?: boolean }) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-11 px-4 align-middle text-[13px] leading-[18px] font-medium whitespace-nowrap text-text-muted first:pl-6 last:pr-6",
        numeric ? "text-right" : "text-left",
        className
      )}
      {...props}
    />
  )
}

function TableCell({
  className,
  numeric,
  ...props
}: React.ComponentProps<"td"> & { numeric?: boolean }) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "px-4 align-middle first:pl-6 last:pr-6",
        numeric && "tabular text-right",
        className
      )}
      {...props}
    />
  )
}

/** Two-line customer cell: name 15/500 + address 13 muted. */
function CustomerCell({ name, detail }: { name: string; detail?: string }) {
  return (
    <div>
      <div className="text-body-strong">{name}</div>
      {detail ? <div className="text-small text-text-muted">{detail}</div> : null}
    </div>
  )
}

export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, CustomerCell }
