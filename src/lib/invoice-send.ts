import { getSendProblems, type SendCheckCustomer, type SendCheckItem } from "./quote-send";
import type { StoredInvoiceStatus } from "./invoice-calc";

/** Rules for sending, paying, voiding and editing an invoice. Pure; the server re-checks them. */

/** What blocks sending. Empty means ready. Reuses the quote checks plus the date order. */
export function getInvoiceSendProblems(
  items: readonly SendCheckItem[],
  customer: SendCheckCustomer,
  dates?: { issueDate: string | null; dueDate: string | null },
): string[] {
  const problems = getSendProblems(items, customer);
  if (dates) {
    if (!dates.dueDate) problems.push("Choose a due date.");
    else if (dates.issueDate && dates.dueDate < dates.issueDate) problems.push("The due date can't be before the issue date.");
  }
  return problems;
}

/** Drafts (first send) and sent / viewed invoices (resend, including partly paid and overdue). */
export function canSend(status: StoredInvoiceStatus): boolean {
  return status === "draft" || status === "sent" || status === "viewed";
}

export function canMarkPaid(status: StoredInvoiceStatus, remaining: number): boolean {
  return (status === "sent" || status === "viewed") && remaining > 0;
}

/** Only drafts and untouched sent invoices: once money is recorded it cannot be voided. */
export function canVoid(status: StoredInvoiceStatus, amountPaidCents: number): boolean {
  return (status === "draft" || status === "sent" || status === "viewed") && amountPaidCents === 0;
}

export function canEdit(status: StoredInvoiceStatus): boolean {
  return status === "draft";
}

/** The link works for any invoice that has been sent and not voided. */
export function hasPublicLink(status: StoredInvoiceStatus): boolean {
  return status === "sent" || status === "viewed" || status === "paid";
}

/** First view only counts while the invoice is still `sent`. */
export function shouldRecordInvoiceView(status: StoredInvoiceStatus, viewedAt: string | null): boolean {
  return status === "sent" && viewedAt === null;
}
