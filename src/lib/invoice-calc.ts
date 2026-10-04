import { defaultValidUntil, formatDocNumber, todayInTimezone } from "./quote-calc";

/**
 * Invoice maths and the derived status. "Overdue" and "partial" are never stored:
 * they are computed from the stored status, the due date, today (in the business
 * timezone) and the amounts. SQL twin: invoice_derived_status() in migration 009.
 */

export type StoredInvoiceStatus = "draft" | "sent" | "viewed" | "paid" | "void";
export type DerivedInvoiceStatus = "draft" | "sent" | "viewed" | "partial" | "paid" | "overdue" | "void";

export function remainingCents(totalCents: number, amountPaidCents: number): number {
  return Math.max(totalCents - amountPaidCents, 0);
}

export function isFullyPaid(totalCents: number, amountPaidCents: number): boolean {
  return totalCents > 0 && amountPaidCents >= totalCents;
}

/**
 * draft / paid / void read as stored. Otherwise: money still owed and past due -> overdue
 * (overdue wins over partial, it is the "money is late" signal); some paid -> partial;
 * else the stored sent / viewed.
 */
export function derivedStatus(
  status: StoredInvoiceStatus,
  dueDate: string,
  today: string,
  remaining: number,
  amountPaidCents = 0,
): DerivedInvoiceStatus {
  if (status === "draft" || status === "paid" || status === "void") return status;
  if (remaining > 0 && dueDate < today) return "overdue";
  if (remaining > 0 && amountPaidCents > 0) return "partial";
  return status;
}

/** Whole days between a due date and today (both yyyy-mm-dd). 0 when not past due. */
export function daysOverdue(dueDate: string, today: string): number {
  if (dueDate >= today) return 0;
  const [dy, dm, dd] = dueDate.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(dy, dm - 1, dd)) / 86_400_000);
}

/** Issue date + payment terms (days) -> due date. */
export function defaultDueDate(issueDate: string, paymentTermsDays: number): string {
  return defaultValidUntil(issueDate, paymentTermsDays);
}

export { formatDocNumber, todayInTimezone };

export type StatRow = {
  status: StoredInvoiceStatus;
  dueDate: string;
  totalCents: number;
  amountPaidCents: number;
};
export type StatPayment = { amountCents: number; paidOn: string; invoiceStatus: StoredInvoiceStatus };

/** First day of a month as yyyy-mm for a yyyy-mm-dd date. */
const monthOf = (date: string) => date.slice(0, 7);

function previousMonth(today: string): string {
  const [y, m] = today.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return d.toISOString().slice(0, 7);
}

/**
 * TS twin of dashboard_stats(): owed and overdue come from sent / viewed invoices with
 * money remaining; paid-this-month is the sum of payments dated in the month (void invoices excluded).
 */
export function summariseInvoices(rows: readonly StatRow[], payments: readonly StatPayment[], today: string) {
  const open = rows.filter((r) => (r.status === "sent" || r.status === "viewed") && remainingCents(r.totalCents, r.amountPaidCents) > 0);
  const overdue = open.filter((r) => r.dueDate < today);
  const sumRemaining = (list: readonly StatRow[]) => list.reduce((s, r) => s + remainingCents(r.totalCents, r.amountPaidCents), 0);
  const paidIn = (month: string) =>
    payments.filter((p) => p.invoiceStatus !== "void" && monthOf(p.paidOn) === month).reduce((s, p) => s + p.amountCents, 0);

  return {
    owedCents: sumRemaining(open),
    owedCount: open.length,
    overdueCents: sumRemaining(overdue),
    overdueCount: overdue.length,
    paidThisMonthCents: paidIn(monthOf(today)),
    paidLastMonthCents: paidIn(previousMonth(today)),
  };
}
