import { formatDateOnly } from "./dates";
import { formatMoney } from "./money";
import { formatBpsAsPercent } from "./money-input";
import { depositCents } from "./quote-calc";
import { formatCustomerAddress, type PublicQuote } from "./public-quote";
import { REGIONS, quoteWord } from "./region";

/**
 * Everything a printed or on-screen quote shows, already formatted as text.
 * Built from the same whitelisted shape as the public page, so the PDF can never
 * contain more than the customer is allowed to see.
 */
export type QuoteDocData = {
  word: string;
  number: string;
  isDraft: boolean;
  title: string | null;
  validUntil: string | null;
  business: { name: string; monogram: string; logoUrl: string | null; contactLine: string; licenceLine: string | null };
  customer: { name: string; address: string | null };
  items: { description: string; qtyText: string; rateText: string; amountText: string }[];
  subtotal: string;
  tax: { label: string; amount: string } | null;
  total: string;
  deposit: { label: string; amount: string; remaining: string } | null;
  notes: string | null;
  photos: { url: string; kind: "before" | "after" | "other" }[];
  /** Footer line, only on free and trial plans. */
  branding: string | null;
  pageSize: "LETTER" | "A4";
};

/** The parts of a printed document that quotes and invoices share. */
export type CommonDocData = Omit<QuoteDocData, "validUntil" | "deposit" | "photos">;

/** PDF renderers handle PNG and JPEG only, so other logo formats fall back to the monogram. */
export function pdfSafeLogoUrl(url: string | null): string | null {
  return url && /\.(png|jpe?g)(\?|$)/i.test(url) ? url : null;
}

/** "Miller Plumbing" -> "MP", "Dave" -> "DA". Up to two letters, from the first two words. */
export function monogramFor(name: string): string {
  const words = name.trim().split(/\s+/).filter((w) => /[a-z0-9]/i.test(w));
  if (words.length === 0) return "T";
  const letters = words.length > 1 ? words[0][0] + words[1][0] : words[0].slice(0, 2);
  return letters.toUpperCase();
}

export function qtyText(qty: number): string {
  return Number.isInteger(qty) ? String(qty) : String(Number(qty.toFixed(2)));
}

export function buildQuoteDocument(
  pub: PublicQuote,
  extra: { logoUrl: string | null; photos: QuoteDocData["photos"] },
): QuoteDocData {
  const { quote, business, customer } = pub;
  const locale = REGIONS[business.country].locale;
  const money = (cents: number) => formatMoney(cents, quote.currency, locale);
  const word = quoteWord(business.country);

  const deposit = quote.deposit_enabled ? depositCents(quote.total_cents, quote.deposit_bps) : null;

  return {
    word,
    number: `${quote.number_prefix}${quote.number}`,
    isDraft: quote.status === "draft",
    title: quote.title,
    validUntil: quote.valid_until ? formatDateOnly(quote.valid_until, locale) : null,
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
    subtotal: money(quote.subtotal_cents),
    tax: quote.tax_rate_bps > 0 ? { label: `${business.tax_label} (${formatBpsAsPercent(quote.tax_rate_bps)}%)`, amount: money(quote.tax_cents) } : null,
    total: money(quote.total_cents),
    deposit:
      deposit === null
        ? null
        : {
            label: `${formatBpsAsPercent(quote.deposit_bps)}% deposit due on acceptance`,
            amount: money(deposit),
            remaining: money(quote.total_cents - deposit),
          },
    notes: quote.notes,
    photos: quote.include_photos ? extra.photos : [],
    branding: business.plan_branding ? "Prepared with Tradeslip" : null,
    pageSize: business.country === "US" ? "LETTER" : "A4",
  };
}

export function quotePdfFilename(word: string, number: number): string {
  return `${word}-${number}.pdf`;
}
