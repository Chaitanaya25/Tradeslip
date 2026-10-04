import { addCents } from "./money";
import { defaultDueDate } from "./invoice-calc";
import { calculateQuoteTotals } from "./quote-calc";
import { buildItemRows, type BusinessSnapshot, type DocItem } from "./quote-helpers";

/** Pure helpers behind the invoice server actions (separate so they can be unit tested). */

export type InvoiceDoc = {
  customerId: string | null;
  title: string | null;
  notes: string | null;
  issueDate: string;
  dueDate: string;
  items: readonly DocItem[];
};

/**
 * Arguments for the `save_invoice` database function. Totals, the tax-rate snapshot and
 * currency are computed here; whatever the browser claimed about totals never reaches it.
 */
export function buildInvoicePayload(doc: InvoiceDoc, business: BusinessSnapshot) {
  const totals = calculateQuoteTotals(
    doc.items.map((i) => ({ qty: i.qty, unitRateCents: i.unit_rate_cents })),
    business.taxEnabled,
    business.taxRateBps,
  );
  return {
    fields: {
      customer_id: doc.customerId,
      title: doc.title,
      notes: doc.notes,
      issue_date: doc.issueDate,
      due_date: doc.dueDate,
      subtotal_cents: totals.subtotalCents,
      tax_cents: totals.taxCents,
      total_cents: addCents(totals.subtotalCents, totals.taxCents),
      tax_rate_bps: business.taxEnabled ? business.taxRateBps : 0,
      currency: business.currency,
    },
    items: buildItemRows(doc.items, totals.lineAmountsCents),
    totals,
  };
}

export type InvoiceDuplicateSource = { customer_id: string | null; title: string | null; notes: string | null };

/** A fresh draft from an existing invoice: same customer, items and text; dates restart from today. */
export function buildInvoiceDuplicatePayload(
  source: InvoiceDuplicateSource,
  items: readonly DocItem[],
  business: BusinessSnapshot & { paymentTermsDays: number },
  today: string,
) {
  return buildInvoicePayload(
    {
      customerId: source.customer_id,
      title: source.title,
      notes: source.notes,
      issueDate: today,
      dueDate: defaultDueDate(today, business.paymentTermsDays),
      items,
    },
    business,
  );
}

type Meta = Record<string, unknown> | null | undefined;

/** Human wording for an invoice activity row. `money` formats cents in the business currency. */
export function describeInvoiceActivity(event: string, meta: Meta, money: (cents: number) => string): string {
  const via = typeof meta?.via === "string" ? meta.via : null;
  switch (event) {
    case "invoice.created":
      return typeof meta?.from_quote === "number" ? `Invoice created from estimate #${meta.from_quote}` : "Invoice created";
    case "invoice.duplicated":
      return `Duplicated${typeof meta?.from_number === "number" ? ` from #${meta.from_number}` : ""}`;
    case "invoice.sent":
      return `Invoice sent${via ? ` by ${via}` : ""}`;
    case "invoice.resent":
      return `Invoice sent again${via ? ` by ${via}` : ""}`;
    case "invoice.emailed":
      return "Invoice emailed to the customer";
    case "invoice.shared":
      return `Link shared${via ? ` by ${via === "sms" ? "text message" : via}` : ""}`;
    case "invoice.viewed":
      return "Invoice viewed by customer";
    case "invoice.payment_recorded": {
      const amount = typeof meta?.amount_cents === "number" ? ` of ${money(meta.amount_cents)}` : "";
      const method = typeof meta?.method === "string" ? ` (${meta.method.replace(/_/g, " ")})` : "";
      return `Payment${amount} recorded${method}`;
    }
    case "invoice.paid":
      return "Invoice paid in full";
    case "invoice.voided":
      return `Invoice voided${typeof meta?.reason === "string" && meta.reason ? `: ${meta.reason}` : ""}`;
    case "invoice.link_regenerated":
      return "New link created. The old link stopped working";
    case "invoice.reminder_sent":
      return "Payment reminder sent";
    default:
      return event.replace(/^[a-z]+\./, "").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
  }
}
