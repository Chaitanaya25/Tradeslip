import { calculateQuoteTotals, defaultValidUntil } from "./quote-calc";

/** Pure helpers behind the quote server actions (kept separate so they can be unit tested). */

// --- Customer matching ---------------------------------------------------

export type CustomerCandidate = {
  id: string;
  name: string;
  phone: string | null;
  postcode: string | null;
};

const normalizeName = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

/** Last 10 digits, so "+1 (413) 555-0182" and "413-555-0182" match. */
export function normalizePhone(phone: string | null | undefined): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

export const normalizePostcode = (postcode: string | null | undefined): string =>
  (postcode ?? "").replace(/\s+/g, "").toLowerCase();

/**
 * Same customer = same name (case-insensitive) AND (same phone OR same postcode).
 * A name on its own is not enough: two different "John Smith"s must not merge.
 */
export function findMatchingCustomer(
  candidates: readonly CustomerCandidate[],
  input: { name: string; phone: string | null; postcode: string | null },
): CustomerCandidate | null {
  const name = normalizeName(input.name);
  const phone = normalizePhone(input.phone);
  const postcode = normalizePostcode(input.postcode);

  return (
    candidates.find((c) => {
      if (normalizeName(c.name) !== name) return false;
      const samePhone = phone !== "" && normalizePhone(c.phone) === phone;
      const samePostcode = postcode !== "" && normalizePostcode(c.postcode) === postcode;
      return samePhone || samePostcode;
    }) ?? null
  );
}

/** Escape LIKE/ILIKE wildcards so a customer called "100%" or "a_b" matches literally. */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

// --- save_quote payload ----------------------------------------------------

export type DocItem = {
  description: string;
  type: string;
  qty: number;
  unit_rate_cents: number;
  price_item_id: string | null;
  needs_price: boolean;
};

export type SaveDoc = {
  customerId: string | null;
  title: string | null;
  notes: string | null;
  validUntil: string | null;
  depositEnabled: boolean;
  depositBps: number;
  includePhotos: boolean;
  items: readonly DocItem[];
  /** Voice note to store. Leave undefined to keep whatever the quote already has. */
  voice?: { path: string | null; transcript: string | null };
};

export type BusinessSnapshot = { taxEnabled: boolean; taxRateBps: number; currency: string };

/**
 * Arguments for the `save_quote` database function. Totals, the tax-rate snapshot
 * and currency are computed here from the items and the business settings.
 * Anything the browser claimed about totals never reaches this function.
 */
export function buildSavePayload(doc: SaveDoc, business: BusinessSnapshot) {
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
      valid_until: doc.validUntil,
      deposit_enabled: doc.depositEnabled,
      deposit_bps: doc.depositBps,
      include_photos: doc.includePhotos,
      subtotal_cents: totals.subtotalCents,
      tax_cents: totals.taxCents,
      total_cents: totals.totalCents,
      // Snapshot of the rate used (0 when tax is off) and the business currency.
      tax_rate_bps: business.taxEnabled ? business.taxRateBps : 0,
      currency: business.currency,
      // Only present when the caller supplied them, so the database keeps existing values otherwise.
      ...(doc.voice ? { voice_note_path: doc.voice.path, transcript: doc.voice.transcript } : {}),
    },
    // Order in the array is the display order; the database stores position = index.
    items: doc.items.map((item, position) => ({
      position,
      description: item.description,
      type: item.type,
      qty: item.qty,
      unit_rate_cents: item.unit_rate_cents,
      amount_cents: totals.lineAmountsCents[position],
      price_item_id: item.price_item_id,
      needs_price: item.needs_price && item.unit_rate_cents === 0,
    })),
    totals,
  };
}

// --- Duplicate -------------------------------------------------------------

export type DuplicateSource = {
  customer_id: string | null;
  title: string | null;
  notes: string | null;
  deposit_enabled: boolean;
  deposit_bps: number;
  include_photos: boolean;
};

/**
 * A fresh draft from an existing quote: same customer, items and text, but totals
 * and the valid-until date are recomputed from today's settings. Tokens, status,
 * timestamps, acceptance details, voice data and photos are deliberately not copied.
 */
export function buildDuplicatePayload(
  source: DuplicateSource,
  items: readonly DocItem[],
  business: BusinessSnapshot & { quoteValidityDays: number },
  today: string,
) {
  return buildSavePayload(
    {
      customerId: source.customer_id,
      title: source.title,
      notes: source.notes,
      validUntil: defaultValidUntil(today, business.quoteValidityDays),
      depositEnabled: source.deposit_enabled,
      depositBps: source.deposit_bps,
      includePhotos: source.include_photos,
      items,
    },
    business,
  );
}

// --- Activity wording --------------------------------------------------------

type Meta = Record<string, unknown> | null | undefined;

/** Human wording for an activity row, e.g. `quote.duplicated` -> "Duplicated from #1043". */
export function describeActivity(event: string, meta: Meta, quoteWord: string): string {
  const word = quoteWord;
  const from = typeof meta?.from_number === "number" ? ` from #${meta.from_number}` : "";
  switch (event) {
    case "quote.created":
      return `${word} created`;
    case "quote.duplicated":
      return `Duplicated${from}`;
    case "quote.sent":
      return `${word} sent${typeof meta?.via === "string" ? ` by ${meta.via}` : ""}`;
    case "quote.viewed":
      return `${word} viewed by customer`;
    case "quote.accepted":
      return `${word} accepted${typeof meta?.name === "string" ? ` by ${meta.name}` : ""}`;
    case "quote.declined":
      return `${word} declined${typeof meta?.reason === "string" && meta.reason ? `: ${meta.reason}` : ""}`;
    case "quote.resent":
      return `${word} sent again${typeof meta?.via === "string" ? ` by ${meta.via}` : ""}`;
    case "quote.emailed":
      return `${word} emailed to the customer`;
    case "quote.shared":
      return `Link shared${typeof meta?.via === "string" ? ` by ${meta.via === "sms" ? "text message" : meta.via}` : ""}`;
    case "quote.link_regenerated":
      return "New link created. The old link stopped working";
    case "quote.followup_sent":
      return "Follow-up reminder sent";
    default:
      return event.replace(/^[a-z]+\./, "").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
  }
}
