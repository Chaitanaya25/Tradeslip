import { derivedStatus, remainingCents, type StoredInvoiceStatus } from "./invoice-calc";

/** A customer's totals from their documents, using the same definitions as the invoice pages. SQL twin: customer_summary(). */

export type CustomerInvoice = {
  status: StoredInvoiceStatus;
  dueDate: string;
  totalCents: number;
  amountPaidCents: number;
  updatedAt: string;
  paidAt?: string | null;
};

export type CustomerQuote = { status: string; updatedAt: string; sentAt?: string | null };

export type CustomerSummary = {
  totalPaidCents: number;
  outstandingCents: number;
  overdueCents: number;
  quoteCount: number;
  invoiceCount: number;
  lastActivityAt: string | null;
};

export function summariseCustomer(input: { quotes: readonly CustomerQuote[]; invoices: readonly CustomerInvoice[]; today: string }): CustomerSummary {
  const live = input.invoices.filter((i) => i.status !== "void");
  let outstanding = 0;
  let overdue = 0;
  for (const i of live) {
    if (i.status !== "sent" && i.status !== "viewed") continue;
    const remaining = remainingCents(i.totalCents, i.amountPaidCents);
    if (remaining <= 0) continue;
    outstanding += remaining;
    if (derivedStatus(i.status, i.dueDate, input.today, remaining, i.amountPaidCents) === "overdue") overdue += remaining;
  }

  const stamps = [
    ...input.quotes.flatMap((q) => [q.updatedAt, q.sentAt ?? null]),
    ...input.invoices.flatMap((i) => [i.updatedAt, i.paidAt ?? null]),
  ].filter((s): s is string => Boolean(s));

  return {
    totalPaidCents: live.reduce((sum, i) => sum + i.amountPaidCents, 0),
    outstandingCents: outstanding,
    overdueCents: overdue,
    quoteCount: input.quotes.length,
    invoiceCount: input.invoices.length,
    lastActivityAt: stamps.length === 0 ? null : stamps.reduce((a, b) => (new Date(a) > new Date(b) ? a : b)),
  };
}
