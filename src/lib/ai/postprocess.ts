import { applyMarkup, calculateQuoteTotals } from "@/lib/quote-calc";
import { findMatchingCustomer, type CustomerCandidate } from "@/lib/quote-helpers";
import type { AiOutput } from "./schema";

/**
 * Deterministic clean-up of the model's draft. The AI proposes; this code decides.
 * In particular the AI can never set the price of an item that exists in the price book.
 */

/** Spoken prices above this ($100,000) are treated as a mis-hearing, not a price. */
export const MAX_SPOKEN_RATE_CENTS = 10_000_000;
export const MAX_DRAFT_ITEMS = 50;

export type PriceBookItem = {
  id: string;
  name: string;
  type: "labour" | "material" | "fee";
  rate_cents: number;
  markup_bps: number;
};

export type DraftItem = {
  description: string;
  type: "labour" | "material" | "fee";
  qty: number;
  unit_rate_cents: number;
  price_item_id: string | null;
  needs_price: boolean;
  /** True when the rate came from the price book. */
  matched: boolean;
};

export type DraftResult = {
  customer: {
    customer_id: string | null;
    name: string;
    email: string;
    phone: string;
    address_line1: string;
    city: string;
    region: string;
    postcode: string;
  };
  job_title: string;
  items: DraftItem[];
  notes: string | null;
  transcript: string;
  matchedCount: number;
  totals: { subtotalCents: number; taxCents: number; totalCents: number };
};

export type PostprocessContext = {
  priceBook: readonly PriceBookItem[];
  customers: readonly CustomerCandidate[];
  business: { calloutFeeCents: number; taxEnabled: boolean; taxRateBps: number };
};

const CALLOUT_WORD = /\bcall[\s-]?out\b|\bcallout\b|\bservice call\b/i;
// Deliberately narrow: only wording that clearly describes going to a site to look, not doing a job.
const SITE_VISIT = /\b(site visit|come out|coming out|come round|come over|go out to|inspection|inspect|assessment|assess|survey|diagnos\w*)\b/i;

const isCalloutItem = (description: string) => CALLOUT_WORD.test(description) || /\bvisit fee\b/i.test(description);

function validSpokenRate(cents: number | null): number | null {
  if (cents === null || !Number.isInteger(cents) || cents <= 0 || cents > MAX_SPOKEN_RATE_CENTS) return null;
  return cents;
}

export function postprocessDraft(ai: AiOutput, ctx: PostprocessContext): DraftResult {
  const byId = new Map(ctx.priceBook.map((p) => [p.id, p]));
  const items: DraftItem[] = [];

  for (const raw of ai.items) {
    if (items.length >= MAX_DRAFT_ITEMS) break;
    const description = raw.description.trim();
    if (!description) continue;

    const known = raw.price_item_id ? byId.get(raw.price_item_id) : undefined;
    if (known) {
      // Price-book rate always wins; markup applies to materials. Whatever the AI said is ignored.
      items.push({
        description,
        type: known.type,
        qty: raw.qty,
        unit_rate_cents: known.type === "material" && known.markup_bps > 0 ? applyMarkup(known.rate_cents, known.markup_bps) : known.rate_cents,
        price_item_id: known.id,
        needs_price: false,
        matched: true,
      });
      continue;
    }

    // Unknown (hallucinated or archived) id: drop the link. A spoken price is kept, otherwise flag it.
    const spoken = validSpokenRate(raw.unit_rate_cents);
    items.push({
      description,
      type: raw.type,
      qty: raw.qty,
      unit_rate_cents: spoken ?? 0,
      price_item_id: null,
      needs_price: spoken === null,
      matched: false,
    });
  }

  addCalloutIfNeeded(items, ai, ctx);

  const totals = calculateQuoteTotals(
    items.map((i) => ({ qty: i.qty, unitRateCents: i.unit_rate_cents })),
    ctx.business.taxEnabled,
    ctx.business.taxRateBps,
  );

  const c = ai.customer;
  const matched =
    c.name && (c.phone || c.postcode)
      ? findMatchingCustomer(ctx.customers, { name: c.name, phone: c.phone, postcode: c.postcode })
      : null;

  return {
    customer: {
      customer_id: matched?.id ?? null,
      name: c.name ?? "",
      email: c.email ?? "",
      phone: c.phone ?? "",
      address_line1: c.address_line1 ?? "",
      city: c.city ?? "",
      region: c.region ?? "",
      postcode: c.postcode ?? "",
    },
    job_title: ai.job_title,
    items,
    notes: ai.notes,
    transcript: ai.transcript,
    matchedCount: items.filter((i) => i.matched).length,
    totals: { subtotalCents: totals.subtotalCents, taxCents: totals.taxCents, totalCents: totals.totalCents },
  };
}

/**
 * Conservative call-out rule. Add one only when:
 *  - the speaker said "call-out", or
 *  - the business charges a call-out fee AND the speech clearly describes a site visit.
 * Never when an item already looks like a call-out.
 */
function addCalloutIfNeeded(items: DraftItem[], ai: AiOutput, ctx: PostprocessContext): void {
  if (items.some((i) => isCalloutItem(i.description))) return;
  if (items.length >= MAX_DRAFT_ITEMS) return;

  const mentioned = CALLOUT_WORD.test(ai.transcript);
  const siteVisit = SITE_VISIT.test(ai.transcript);
  const businessFee = ctx.business.calloutFeeCents;
  if (!mentioned && !(businessFee > 0 && siteVisit)) return;

  const bookItem = ctx.priceBook.find((p) => CALLOUT_WORD.test(p.name));
  if (bookItem) {
    items.push({
      description: bookItem.name,
      type: bookItem.type,
      qty: 1,
      unit_rate_cents: bookItem.rate_cents,
      price_item_id: bookItem.id,
      needs_price: false,
      matched: true,
    });
    return;
  }

  items.push({
    description: "Call-out fee",
    type: "fee",
    qty: 1,
    unit_rate_cents: businessFee > 0 ? businessFee : 0,
    price_item_id: null,
    needs_price: businessFee <= 0,
    matched: false,
  });
}
