import { describe, expect, it } from "vitest";
import {
  buildDuplicatePayload,
  buildSavePayload,
  describeActivity,
  escapeLikePattern,
  findMatchingCustomer,
  normalizePhone,
  type DocItem,
} from "./quote-helpers";

const customers = [
  { id: "c1", name: "Sarah Thompson", phone: "(413) 555-0182", postcode: "01103" },
  { id: "c2", name: "James O'Connor", phone: null, postcode: "SW1A 1AA" },
  { id: "c3", name: "Sarah Thompson", phone: "(617) 555-0000", postcode: "02139" },
];

describe("findMatchingCustomer", () => {
  it("matches name case-insensitively plus phone", () => {
    expect(findMatchingCustomer(customers, { name: "  sarah   THOMPSON ", phone: "413-555-0182", postcode: null })?.id).toBe("c1");
  });
  it("matches name plus postcode (ignoring spaces and case)", () => {
    expect(findMatchingCustomer(customers, { name: "james o'connor", phone: null, postcode: "sw1a1aa" })?.id).toBe("c2");
  });
  it("picks the right one of two people with the same name", () => {
    expect(findMatchingCustomer(customers, { name: "Sarah Thompson", phone: null, postcode: "02139" })?.id).toBe("c3");
  });
  it("does not match on name alone", () => {
    expect(findMatchingCustomer(customers, { name: "Sarah Thompson", phone: null, postcode: null })).toBeNull();
    expect(findMatchingCustomer(customers, { name: "Sarah Thompson", phone: "999", postcode: "99999" })).toBeNull();
  });
  it("does not match a different name with the same phone", () => {
    expect(findMatchingCustomer(customers, { name: "Someone Else", phone: "(413) 555-0182", postcode: "01103" })).toBeNull();
  });
  it("normalises phones to the last 10 digits", () => {
    expect(normalizePhone("+1 (413) 555-0182")).toBe("4135550182");
    expect(normalizePhone(null)).toBe("");
  });
});

describe("escapeLikePattern", () => {
  it("escapes wildcard characters", () => {
    expect(escapeLikePattern("100%_off\\")).toBe("100\\%\\_off\\\\");
    expect(escapeLikePattern("plain")).toBe("plain");
  });
});

const items: DocItem[] = [
  { description: "Labour", type: "labour", qty: 1.5, unit_rate_cents: 9500, price_item_id: null, needs_price: false },
  { description: "Mixer tap", type: "material", qty: 1, unit_rate_cents: 0, price_item_id: "p1", needs_price: true },
  { description: "Call-out fee", type: "fee", qty: 1, unit_rate_cents: 4500, price_item_id: null, needs_price: false },
];
const business = { taxEnabled: true, taxRateBps: 800, currency: "USD" };

describe("buildSavePayload", () => {
  const payload = buildSavePayload(
    { customerId: "c1", title: "Tap", notes: null, validUntil: "2026-11-03", depositEnabled: true, depositBps: 3000, includePhotos: false, items },
    business,
  );
  it("orders items by array index", () => {
    expect(payload.items.map((i) => i.position)).toEqual([0, 1, 2]);
    expect(payload.items.map((i) => i.description)).toEqual(["Labour", "Mixer tap", "Call-out fee"]);
  });
  it("computes line amounts and totals on the server side", () => {
    expect(payload.items.map((i) => i.amount_cents)).toEqual([14250, 0, 4500]);
    expect(payload.fields).toMatchObject({ subtotal_cents: 18750, tax_cents: 1500, total_cents: 20250, tax_rate_bps: 800, currency: "USD" });
  });
  it("keeps needs_price only while the rate is zero", () => {
    expect(payload.items[1].needs_price).toBe(true);
    const priced = buildSavePayload(
      { customerId: null, title: null, notes: null, validUntil: null, depositEnabled: false, depositBps: 3000, includePhotos: false, items: [{ ...items[1], unit_rate_cents: 8000 }] },
      business,
    );
    expect(priced.items[0].needs_price).toBe(false);
  });
  it("snapshots a zero rate when tax is off", () => {
    const off = buildSavePayload(
      { customerId: null, title: null, notes: null, validUntil: null, depositEnabled: false, depositBps: 3000, includePhotos: false, items },
      { ...business, taxEnabled: false },
    );
    expect(off.fields).toMatchObject({ tax_cents: 0, total_cents: 18750, tax_rate_bps: 0 });
  });
});

describe("buildSavePayload: voice note", () => {
  const doc = { customerId: null, title: null, notes: null, validUntil: null, depositEnabled: false, depositBps: 3000, includePhotos: false, items: [] as DocItem[] };
  it("omits the voice fields unless supplied, so the database keeps what it has", () => {
    const f = buildSavePayload(doc, business).fields;
    expect(f).not.toHaveProperty("voice_note_path");
    expect(f).not.toHaveProperty("transcript");
  });
  it("includes them when supplied (null clears)", () => {
    expect(buildSavePayload({ ...doc, voice: { path: "b/x.webm", transcript: "hi" } }, business).fields).toMatchObject({ voice_note_path: "b/x.webm", transcript: "hi" });
    expect(buildSavePayload({ ...doc, voice: { path: null, transcript: null } }, business).fields).toMatchObject({ voice_note_path: null, transcript: null });
  });
});

describe("buildDuplicatePayload", () => {
  const source = { customer_id: "c1", title: "Kitchen tap", notes: "Old tap taken away.", deposit_enabled: true, deposit_bps: 3000, include_photos: true };
  const dup = buildDuplicatePayload(source, items, { ...business, quoteValidityDays: 30 }, "2026-10-04");

  it("copies customer, text and items", () => {
    expect(dup.fields).toMatchObject({ customer_id: "c1", title: "Kitchen tap", notes: "Old tap taken away.", deposit_enabled: true, include_photos: true });
    expect(dup.items).toHaveLength(3);
  });
  it("recomputes valid_until and totals from current settings", () => {
    expect(dup.fields.valid_until).toBe("2026-11-03");
    const noTax = buildDuplicatePayload(source, items, { ...business, taxEnabled: false, quoteValidityDays: 14 }, "2026-10-04");
    expect(noTax.fields.valid_until).toBe("2026-10-18");
    expect(noTax.fields.tax_cents).toBe(0);
  });
  it("carries no identifiers, tokens or timestamps", () => {
    const keys = Object.keys(dup.fields);
    for (const forbidden of ["id", "public_token", "status", "number", "sent_at", "viewed_at", "accepted_at", "accepted_name", "transcript", "voice_note_path"]) {
      expect(keys).not.toContain(forbidden);
    }
  });
});

describe("describeActivity", () => {
  it("words the known events", () => {
    expect(describeActivity("quote.created", {}, "Estimate")).toBe("Estimate created");
    expect(describeActivity("quote.duplicated", { from_number: 1043 }, "Quote")).toBe("Duplicated from #1043");
    expect(describeActivity("quote.duplicated", null, "Quote")).toBe("Duplicated");
    expect(describeActivity("quote.sent", { via: "email" }, "Quote")).toBe("Quote sent by email");
    expect(describeActivity("quote.accepted", { name: "Sarah Thompson" }, "Estimate")).toBe("Estimate accepted by Sarah Thompson");
    expect(describeActivity("quote.declined", { reason: "Too dear" }, "Quote")).toBe("Quote declined: Too dear");
  });
  it("falls back to a readable label", () => {
    expect(describeActivity("quote.something_new", {}, "Quote")).toBe("Something new");
  });
});
