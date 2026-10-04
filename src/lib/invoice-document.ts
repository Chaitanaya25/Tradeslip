import { formatDateOnly } from "./dates";
import { formatMoney } from "./money";
import { formatBpsAsPercent } from "./money-input";
import { formatCustomerAddress } from "./public-quote";
import type { PublicInvoice } from "./public-invoice";
import { monogramFor, pdfSafeLogoUrl, qtyText, type CommonDocData } from "./quote-document";
import { REGIONS } from "./region";

/**
 * Everything a printed invoice shows, already formatted as text. Built from the same
 * whitelisted shape as the public invoice page, so the PDF can never contain more than
 * the customer is allowed to see.
 */
export type InvoiceDocData = CommonDocData & {
  issueDate: string;
  dueDate: string;
  /** Present once something has been paid. */
  amountPaid: string | null;
  balanceDue: string | null;
  paidInFull: boolean;
  /** The business's own payment link, printed as text so it can be typed from paper. */
  paymentUrl: string | null;
};

export function buildInvoiceDocument(pub: PublicInvoice, extra: { logoUrl: string | null; isDraft?: boolean }): InvoiceDocData {
  const { invoice, business, customer } = pub;
  const locale = REGIONS[business.country].locale;
  const money = (cents: number) => formatMoney(cents, invoice.currency, locale);
  const paidInFull = invoice.status === "paid";

  return {
    word: "Invoice",
    number: `${invoice.number_prefix}${invoice.number}`,
    isDraft: extra.isDraft ?? false,
    title: invoice.title,
    business: {
      name: business.name,
      monogram: monogramFor(business.name),
      logoUrl: pdfSafeLogoUrl(extra.logoUrl),
      contactLine: [business.phone, business.email].filter(Boolean).join("  ·  "),
      licenceLine: business.tax_number ? `${business.tax_label === "Sales tax" ? "Tax ID" : business.tax_label}: ${business.tax_number}` : null,
    },
    customer: { name: customer.name ?? "", address: formatCustomerAddress(customer) || null },
    items: [...pub.items]
      .sort((a, b) => a.position - b.position)
      .map((i) => ({
        description: i.description,
        qtyText: qtyText(Number(i.qty)),
        rateText: money(i.unit_rate_cents),
        amountText: money(i.amount_cents),
      })),
    subtotal: money(invoice.subtotal_cents),
    tax: invoice.tax_rate_bps > 0 ? { label: `${business.tax_label} (${formatBpsAsPercent(invoice.tax_rate_bps)}%)`, amount: money(invoice.tax_cents) } : null,
    total: money(invoice.total_cents),
    notes: invoice.notes,
    branding: business.plan_branding ? "Prepared with Tradeslip" : null,
    pageSize: business.country === "US" ? "LETTER" : "A4",
    issueDate: formatDateOnly(invoice.issue_date, locale),
    dueDate: formatDateOnly(invoice.due_date, locale),
    amountPaid: invoice.amount_paid_cents > 0 ? money(invoice.amount_paid_cents) : null,
    balanceDue: invoice.amount_paid_cents > 0 ? money(invoice.remaining_cents) : null,
    paidInFull,
    paymentUrl: !paidInFull && invoice.remaining_cents > 0 ? business.payment_link_url : null,
  };
}

/** `Invoice-1001.pdf`: the number without the prefix, so a prefix like "INV-" is not repeated. */
export function invoicePdfFilename(number: number): string {
  return `Invoice-${number}.pdf`;
}
