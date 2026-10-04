"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Search } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { TableCard } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatShortDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

export type CustomerListRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string;
  archived: boolean;
  quoteCount: number;
  invoiceCount: number;
  outstandingCents: number;
  totalPaidCents: number;
  lastActivityAt: string | null;
};

type Sort = "name" | "outstanding" | "activity";
const SORTS: { value: Sort; label: string }[] = [
  { value: "name", label: "Name" },
  { value: "outstanding", label: "Outstanding" },
  { value: "activity", label: "Last activity" },
];

export function sortCustomers(rows: readonly CustomerListRow[], sort: Sort): CustomerListRow[] {
  const copy = [...rows];
  if (sort === "outstanding") return copy.sort((a, b) => b.outstandingCents - a.outstandingCents || a.name.localeCompare(b.name));
  if (sort === "activity") return copy.sort((a, b) => (b.lastActivityAt ?? "").localeCompare(a.lastActivityAt ?? "") || a.name.localeCompare(b.name));
  return copy.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

export function CustomersList({ rows, currency, locale, timezone }: { rows: CustomerListRow[]; currency: string; locale: string; timezone: string }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("name");
  const [showArchived, setShowArchived] = useState(false);

  const archivedCount = rows.filter((r) => r.archived).length;
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = rows.filter((r) => {
      if (r.archived && !showArchived) return false;
      if (!q) return true;
      return [r.name, r.email ?? "", r.phone ?? "", r.address].some((v) => v.toLowerCase().includes(q));
    });
    return sortCustomers(filtered, sort);
  }, [rows, query, sort, showArchived]);

  const money = (cents: number) => formatMoney(cents, currency, locale);
  const live = rows.filter((r) => !r.archived).length;

  return (
    <>
      <PageHeader
        title="Customers"
        description={live > 0 ? `${live} ${live === 1 ? "customer" : "customers"}.` : undefined}
        actions={
          <Button asChild>
            <Link href="/customers/new">
              <Plus /> Add customer
            </Link>
          </Button>
        }
      />

      {rows.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-6 shadow-card">
          <p className="text-body text-text-muted">No customers yet.</p>
          <Button asChild className="mt-4">
            <Link href="/customers/new">
              <Plus /> Add your first customer
            </Link>
          </Button>
        </div>
      ) : (
        <TableCard>
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-6 py-4">
            <div className="relative w-full md:w-80">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-[18px] -translate-y-1/2 text-text-muted" strokeWidth={1.5} />
              <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name, phone or email" aria-label="Search customers" className="pl-10" />
            </div>
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Sort by">
              <span className="text-label text-text-muted">Sort</span>
              {SORTS.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  aria-pressed={sort === s.value}
                  onClick={() => setSort(s.value)}
                  className={cn(
                    "text-label h-9 rounded-lg border px-3 transition-colors duration-150",
                    sort === s.value ? "border-accent-border bg-accent-soft text-accent" : "border-border-strong bg-surface text-text hover:bg-surface-muted",
                  )}
                >
                  {s.label}
                </button>
              ))}
              {archivedCount > 0 ? (
                <button
                  type="button"
                  aria-pressed={showArchived}
                  onClick={() => setShowArchived((v) => !v)}
                  className="text-label h-9 rounded-lg border border-border-strong px-3 text-text-muted hover:bg-surface-muted"
                >
                  {showArchived ? "Hide archived" : `Show archived (${archivedCount})`}
                </button>
              ) : null}
            </div>
          </div>

          {visible.length === 0 ? (
            <p className="text-body px-6 py-8 text-text-muted">{query.trim() ? `No customers match "${query.trim()}".` : "No customers to show."}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="h-11 hover:bg-transparent">
                  <TableHead>Customer</TableHead>
                  <TableHead className="hidden md:table-cell">Contact</TableHead>
                  <TableHead numeric className="hidden sm:table-cell">
                    Quotes
                  </TableHead>
                  <TableHead numeric>Outstanding</TableHead>
                  <TableHead numeric className="hidden lg:table-cell">
                    Total paid
                  </TableHead>
                  <TableHead className="hidden lg:table-cell">Last activity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((r) => (
                  <TableRow key={r.id} className="cursor-pointer" onClick={() => router.push(`/customers/${r.id}`)}>
                    <TableCell>
                      <Link href={`/customers/${r.id}`} onClick={(e) => e.stopPropagation()} className="text-body-strong block rounded-md hover:underline">
                        {r.name}
                        {r.archived ? <span className="text-small ml-2 font-normal text-text-muted">Archived</span> : null}
                      </Link>
                      <span className="text-small block text-text-muted">{r.address || "No address"}</span>
                      <span className="text-small block text-text-muted md:hidden">{r.phone ?? r.email ?? ""}</span>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {r.phone ?? <span className="text-text-muted">No phone</span>}
                      <span className="text-small block text-text-muted">{r.email ?? ""}</span>
                    </TableCell>
                    <TableCell numeric className="hidden sm:table-cell">
                      {r.quoteCount}
                    </TableCell>
                    <TableCell numeric className={r.outstandingCents > 0 ? "text-accent" : "text-text-muted"}>
                      {r.outstandingCents > 0 ? money(r.outstandingCents) : "None"}
                    </TableCell>
                    <TableCell numeric className="hidden lg:table-cell">
                      {r.totalPaidCents > 0 ? money(r.totalPaidCents) : <span className="text-text-muted">None</span>}
                    </TableCell>
                    <TableCell className="tabular hidden text-text-muted lg:table-cell">{r.lastActivityAt ? formatShortDate(r.lastActivityAt, locale, timezone) : ""}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TableCard>
      )}
    </>
  );
}
