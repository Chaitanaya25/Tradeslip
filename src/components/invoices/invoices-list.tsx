"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Ban, Banknote, Copy, ExternalLink, MoreHorizontal, Plus, Search } from "lucide-react";
import { RecordPaymentDialog } from "@/components/invoices/record-payment-dialog";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { TableCard } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { StatusPill } from "@/components/ui/status-pill";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { formatDateOnly } from "@/lib/dates";
import { daysOverdue, derivedStatus, remainingCents, type DerivedInvoiceStatus, type StoredInvoiceStatus } from "@/lib/invoice-calc";
import { canMarkPaid, canVoid } from "@/lib/invoice-send";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { duplicateInvoice } from "@/server/actions/invoices";
import { voidInvoice } from "@/server/actions/invoice-payments";

export type InvoiceRow = {
  id: string;
  number: number;
  title: string | null;
  status: StoredInvoiceStatus;
  total_cents: number;
  amount_paid_cents: number;
  due_date: string;
  created_at: string;
  customers: { name: string; address_line1: string | null; city: string | null } | null;
};

const FILTERS = ["all", "draft", "sent", "viewed", "partial", "overdue", "paid", "void"] as const;
type Filter = (typeof FILTERS)[number];
const FILTER_LABELS: Record<Filter, string> = {
  all: "All",
  draft: "Draft",
  sent: "Sent",
  viewed: "Viewed",
  partial: "Partial",
  overdue: "Overdue",
  paid: "Paid",
  void: "Void",
};

export function InvoicesList({
  invoices,
  currency,
  locale,
  today,
  docPrefix,
}: {
  invoices: InvoiceRow[];
  currency: string;
  locale: string;
  /** Business-local date (yyyy-mm-dd), so "overdue" is decided in the business timezone. */
  today: string;
  docPrefix: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [paying, setPaying] = useState<InvoiceRow | null>(null);
  const [voiding, setVoiding] = useState<InvoiceRow | null>(null);
  const [pending, startTransition] = useTransition();

  const rows = useMemo(
    () =>
      invoices.map((inv) => {
        const remaining = remainingCents(inv.total_cents, inv.amount_paid_cents);
        const status: DerivedInvoiceStatus = derivedStatus(inv.status, inv.due_date, today, remaining, inv.amount_paid_cents);
        return { inv, remaining, status };
      }),
    [invoices, today],
  );

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: rows.length, draft: 0, sent: 0, viewed: 0, partial: 0, overdue: 0, paid: 0, void: 0 };
    for (const r of rows) c[r.status] += 1;
    return c;
  }, [rows]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^#/, "");
    return rows.filter(({ inv, status }) => {
      if (filter !== "all" && status !== filter) return false;
      if (!q) return true;
      return (inv.customers?.name ?? "").toLowerCase().includes(q) || `${docPrefix}${inv.number}`.toLowerCase().includes(q);
    });
  }, [rows, filter, query, docPrefix]);

  function duplicate(inv: InvoiceRow) {
    startTransition(async () => {
      const result = await duplicateInvoice(inv.id);
      if (!result.ok) return void toast.error(result.message);
      toast.success(`Duplicated as invoice #${docPrefix}${result.number}.`);
      router.push(`/invoices/${result.invoiceId}/edit`);
    });
  }

  function confirmVoid() {
    if (!voiding) return;
    const inv = voiding;
    startTransition(async () => {
      const result = await voidInvoice(inv.id, "");
      setVoiding(null);
      if (result.ok) {
        toast.success("Invoice voided.");
        router.refresh();
      } else toast.error(result.message);
    });
  }

  return (
    <>
      <PageHeader
        title="Invoices"
        description={invoices.length > 0 ? `${invoices.length} in total, newest first.` : undefined}
        actions={
          <Button asChild>
            <Link href="/invoices/new">
              <Plus /> New invoice
            </Link>
          </Button>
        }
      />

      {invoices.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-6 shadow-card">
          <p className="text-body text-text-muted">No invoices yet.</p>
          <Button asChild className="mt-4">
            <Link href="/invoices/new">
              <Plus /> Create your first invoice
            </Link>
          </Button>
        </div>
      ) : (
        <TableCard>
          <div className="space-y-4 border-b border-border px-6 py-4">
            <div className="relative w-full md:w-80">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-[18px] -translate-y-1/2 text-text-muted" strokeWidth={1.5} />
              <Input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by customer or number"
                aria-label="Search invoices"
                className="pl-10"
              />
            </div>
            <div role="group" aria-label="Filter by status" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              {FILTERS.map((f) => (
                <button
                  key={f}
                  type="button"
                  aria-pressed={filter === f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    "text-label flex h-9 shrink-0 items-center gap-2 rounded-lg border px-3 transition-colors duration-150",
                    filter === f ? "border-accent-border bg-accent-soft text-accent" : "border-border-strong bg-surface text-text hover:bg-surface-muted",
                  )}
                >
                  {FILTER_LABELS[f]}
                  <span className={cn("tabular font-normal", filter === f ? "text-accent" : "text-text-muted")}>{counts[f]}</span>
                </button>
              ))}
            </div>
          </div>

          {visible.length === 0 ? (
            <p className="text-body px-6 py-8 text-text-muted">
              {query.trim() ? `No invoices match "${query.trim()}".` : `No ${FILTER_LABELS[filter].toLowerCase()} invoices.`}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="h-11 hover:bg-transparent">
                  <TableHead>Customer</TableHead>
                  <TableHead>Job</TableHead>
                  <TableHead numeric>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead className="w-16">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map(({ inv, remaining, status }) => {
                  const address = [inv.customers?.address_line1, inv.customers?.city].filter(Boolean).join(", ");
                  const late = status === "overdue" ? daysOverdue(inv.due_date, today) : 0;
                  const showRemaining = inv.amount_paid_cents > 0 && remaining > 0;
                  return (
                    <TableRow key={inv.id} className="cursor-pointer" onClick={() => router.push(`/invoices/${inv.id}`)}>
                      <TableCell>
                        <Link href={`/invoices/${inv.id}`} onClick={(e) => e.stopPropagation()} className="text-body-strong block rounded-md hover:underline">
                          {inv.customers?.name ?? "No customer"}
                        </Link>
                        <span className="text-small block text-text-muted">{address || `#${docPrefix}${inv.number}`}</span>
                      </TableCell>
                      <TableCell>{inv.title || <span className="text-text-muted">#{docPrefix}{inv.number}</span>}</TableCell>
                      <TableCell numeric>
                        {formatMoney(inv.total_cents, currency, locale)}
                        {showRemaining ? <span className="text-small block text-text-muted">{formatMoney(remaining, currency, locale)} remaining</span> : null}
                      </TableCell>
                      <TableCell>
                        <StatusPill status={status} />
                        {late > 0 ? <span className="text-small mt-1 block text-text-muted">{late === 1 ? "1 day overdue" : `${late} days overdue`}</span> : null}
                      </TableCell>
                      <TableCell className="tabular text-text-muted">{status === "draft" ? "" : formatDateOnly(inv.due_date, locale)}</TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="icon" className="size-9 border-transparent bg-transparent" aria-label={`Actions for invoice ${inv.number}`} disabled={pending}>
                              <MoreHorizontal />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => router.push(`/invoices/${inv.id}`)}>
                              <ExternalLink /> Open
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => duplicate(inv)}>
                              <Copy /> Duplicate
                            </DropdownMenuItem>
                            {canMarkPaid(inv.status, remaining) ? (
                              <DropdownMenuItem onSelect={() => setPaying(inv)}>
                                <Banknote /> Mark paid
                              </DropdownMenuItem>
                            ) : null}
                            {canVoid(inv.status, inv.amount_paid_cents) ? (
                              <DropdownMenuItem variant="destructive" onSelect={() => setVoiding(inv)}>
                                <Ban /> Void
                              </DropdownMenuItem>
                            ) : null}
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
      )}

      {paying ? (
        <RecordPaymentDialog
          open
          onOpenChange={(open) => {
            if (!open) setPaying(null);
          }}
          invoiceId={paying.id}
          label={`${docPrefix}${paying.number}`}
          remainingCents={remainingCents(paying.total_cents, paying.amount_paid_cents)}
          currency={currency}
          locale={locale}
          today={today}
        />
      ) : null}
      <ConfirmDialog
        open={voiding !== null}
        onOpenChange={(open) => {
          if (!open) setVoiding(null);
        }}
        title="Void this invoice?"
        description="It will be kept for your records but can no longer be paid or sent. Its link stops working for the customer."
        confirmLabel="Void invoice"
        pending={pending}
        onConfirm={confirmVoid}
      />
    </>
  );
}
