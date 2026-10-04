"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ExternalLink, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TableCard } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { StatusPill } from "@/components/ui/status-pill";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatShortDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import type { RecentRow } from "@/lib/dashboard-queries";

/** Latest quotes and invoices together. Rows open the document; below `md` the job moves under the name. */
export function RecentActivity({
  rows,
  currency,
  locale,
  timezone,
  quoteWord,
}: {
  rows: RecentRow[];
  currency: string;
  locale: string;
  timezone: string;
  quoteWord: string;
}) {
  const router = useRouter();
  return (
    <TableCard className="lg:col-span-2">
      <div className="flex items-center justify-between gap-4 border-b border-border px-6 py-5">
        <h2 className="text-h2">Recent activity</h2>
        <Button asChild variant="ghost">
          <Link href="/quotes">
            View all <ArrowRight />
          </Link>
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="text-body px-6 py-8 text-text-muted">Nothing yet. Quotes and invoices will show up here.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="h-11 hover:bg-transparent">
              <TableHead>Customer</TableHead>
              <TableHead className="hidden md:table-cell">Job</TableHead>
              <TableHead numeric>Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden sm:table-cell">Date</TableHead>
              <TableHead className="w-12">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const kindLabel = row.kind === "quote" ? quoteWord : "Invoice";
              return (
                <TableRow key={row.key} className="cursor-pointer" onClick={() => router.push(row.href)}>
                  <TableCell>
                    <Link href={row.href} onClick={(e) => e.stopPropagation()} className="text-body-strong block rounded-md hover:underline">
                      {row.customer}
                    </Link>
                    <span className="text-small block text-text-muted">{row.address || kindLabel}</span>
                    <span className="text-small block text-text-muted md:hidden">{row.job}</span>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {row.job}
                    <span className="text-small block text-text-muted">{kindLabel}</span>
                  </TableCell>
                  <TableCell numeric>{formatMoney(row.amountCents, currency, locale)}</TableCell>
                  <TableCell>
                    <StatusPill status={row.status} />
                  </TableCell>
                  <TableCell className="tabular hidden text-text-muted sm:table-cell">{formatShortDate(row.updatedAt, locale, timezone)}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="icon" className="size-9 border-transparent bg-transparent" aria-label={`Actions for ${kindLabel.toLowerCase()} for ${row.customer}`}>
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => router.push(row.href)}>
                          <ExternalLink /> Open {kindLabel.toLowerCase()}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </TableCard>
  );
}
