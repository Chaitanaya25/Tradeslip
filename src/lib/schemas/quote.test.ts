import { describe, expect, it } from "vitest";
import { emptyCustomer, emptyItem, quoteInputSchema, validateQuoteForSending, type QuoteFormValues } from "./quote";

const base = (): QuoteFormValues => ({
  customer: { ...emptyCustomer(), name: "Sarah Thompson", phone: "(413) 555-0182", email: "sarah@example.com", postcode: "01103" },
  title: "Kitchen tap replacement",
  notes: "",
  valid_until: "2026-11-03",
  deposit_enabled: true,
  deposit_percent: "30",
  include_photos: false,
  items: [
    { description: "Kitchen mixer tap replacement — labour", type: "labour", qty: "1", rate: "120.00", price_item_id: "", needs_price: false },
    { description: "Hourly labour", type: "labour", qty: "1.5", rate: "95", price_item_id: "", needs_price: false },
  ],
});

function errors(values: QuoteFormValues) {
  const r = quoteInputSchema.safeParse(values);
  return r.success ? {} : Object.fromEntries(r.error.issues.map((i) => [String(i.path[0]), i.message]));
}

describe("quoteInputSchema: customer", () => {
  it("requires a name; the rest is optional", () => {
    expect(errors({ ...base(), customer: { ...emptyCustomer() } })).toMatchObject({ "customer.name": expect.any(String) });
    const ok = quoteInputSchema.parse({ ...base(), customer: { ...emptyCustomer(), name: "  Tom  " } });
    expect(ok.customer).toMatchObject({ name: "Tom", email: null, phone: null, postcode: null, customer_id: null });
  });
  it("validates email, phone and uuid when given", () => {
    const e = errors({ ...base(), customer: { ...base().customer, email: "nope", phone: "abc", customer_id: "not-a-uuid" } });
    expect(Object.keys(e).sort()).toEqual(["customer.customer_id", "customer.email", "customer.phone"]);
  });
  it("accepts an existing customer id", () => {
    const id = "6f1c2c1e-0000-4000-8000-000000000001";
    expect(quoteInputSchema.parse({ ...base(), customer: { ...base().customer, customer_id: id } }).customer.customer_id).toBe(id);
  });
});

describe("quoteInputSchema: items", () => {
  it("converts rate to cents and keeps decimal quantities", () => {
    const q = quoteInputSchema.parse(base());
    expect(q.items).toEqual([
      expect.objectContaining({ qty: 1, unit_rate_cents: 12000, type: "labour", needs_price: false, price_item_id: null }),
      expect.objectContaining({ qty: 1.5, unit_rate_cents: 9500 }),
    ]);
  });
  it("allows a draft with zero items", () => {
    expect(quoteInputSchema.parse({ ...base(), items: [] }).items).toEqual([]);
  });
  it("drops fully blank rows but keeps real indexes in errors", () => {
    const values = { ...base(), items: [emptyItem(), { ...emptyItem(), description: "Call-out fee", type: "fee", rate: "45", qty: "0" }] };
    const e = errors(values);
    expect(e).toEqual({ "items.1.qty": expect.stringMatching(/quantity/) });
    const ok = quoteInputSchema.parse({ ...values, items: [emptyItem(), { ...emptyItem(), description: "Call-out fee", type: "fee", rate: "45" }] });
    expect(ok.items).toHaveLength(1);
    expect(ok.items[0].description).toBe("Call-out fee");
  });
  it("requires a description when a rate is given", () => {
    expect(errors({ ...base(), items: [{ ...emptyItem(), rate: "10" }] })).toEqual({ "items.0.description": expect.stringMatching(/description/) });
  });
  it.each(["0", "-1", "1.234", "abc", "", "1e2", "100001"])("rejects quantity %j", (qty) => {
    expect(errors({ ...base(), items: [{ ...emptyItem(), description: "x", qty }] })).toHaveProperty("items.0.qty");
  });
  it("accepts quantities with up to 2 decimals", () => {
    for (const [qty, n] of [["2", 2], ["0.5", 0.5], [".25", 0.25], ["10.75", 10.75]] as const) {
      expect(quoteInputSchema.parse({ ...base(), items: [{ ...emptyItem(), description: "x", qty }] }).items[0].qty).toBe(n);
    }
  });
  it("treats a blank rate as zero and flags bad rates", () => {
    expect(quoteInputSchema.parse({ ...base(), items: [{ ...emptyItem(), description: "Mixer tap" }] }).items[0].unit_rate_cents).toBe(0);
    expect(errors({ ...base(), items: [{ ...emptyItem(), description: "x", rate: "12.345" }] })).toHaveProperty("items.0.rate");
    expect(errors({ ...base(), items: [{ ...emptyItem(), description: "x", rate: "-5" }] })).toHaveProperty("items.0.rate");
  });
  it("clears needs_price once a price is entered", () => {
    const item = { ...emptyItem(), description: "Mixer tap", needs_price: true };
    expect(quoteInputSchema.parse({ ...base(), items: [item] }).items[0].needs_price).toBe(true);
    expect(quoteInputSchema.parse({ ...base(), items: [{ ...item, rate: "80" }] }).items[0].needs_price).toBe(false);
  });
  it("rejects an unknown type", () => {
    expect(errors({ ...base(), items: [{ ...emptyItem(), description: "x", type: "stuff" }] })).toHaveProperty("items.0.type");
  });
});

describe("quoteInputSchema: quote fields", () => {
  it("stores the deposit percent as basis points", () => {
    expect(quoteInputSchema.parse({ ...base(), deposit_percent: "30" }).deposit_bps).toBe(3000);
    expect(quoteInputSchema.parse({ ...base(), deposit_percent: "12.5" }).deposit_bps).toBe(1250);
  });
  it("validates the deposit only while enabled", () => {
    expect(errors({ ...base(), deposit_percent: "0" })).toHaveProperty("deposit_percent");
    expect(errors({ ...base(), deposit_percent: "101" })).toHaveProperty("deposit_percent");
    expect(errors({ ...base(), deposit_percent: "" })).toHaveProperty("deposit_percent");
    const off = quoteInputSchema.parse({ ...base(), deposit_enabled: false, deposit_percent: "garbage" });
    expect(off.deposit_bps).toBe(3000);
    expect(quoteInputSchema.parse({ ...base(), deposit_enabled: false, deposit_percent: "25" }).deposit_bps).toBe(2500);
  });
  it("validates the valid-until date; blank means none", () => {
    expect(quoteInputSchema.parse({ ...base(), valid_until: "" }).valid_until).toBeNull();
    expect(errors({ ...base(), valid_until: "2026-02-30" })).toHaveProperty("valid_until");
    expect(errors({ ...base(), valid_until: "03/11/2026" })).toHaveProperty("valid_until");
  });
  it("turns blank title and notes into null", () => {
    const q = quoteInputSchema.parse({ ...base(), title: "  ", notes: "" });
    expect(q.title).toBeNull();
    expect(q.notes).toBeNull();
  });
  it("does not accept totals from the client (extra keys are ignored)", () => {
    const q = quoteInputSchema.parse({ ...base(), total_cents: 1, subtotal_cents: 1, tax_cents: 1 } as never);
    expect(q).not.toHaveProperty("total_cents");
    expect(q).not.toHaveProperty("subtotal_cents");
  });
});

describe("validateQuoteForSending", () => {
  it("passes a complete quote", () => {
    expect(validateQuoteForSending(quoteInputSchema.parse(base()))).toEqual([]);
  });
  it("flags no items and unpriced lines", () => {
    expect(validateQuoteForSending(quoteInputSchema.parse({ ...base(), items: [] }))).toEqual(["Add at least one item."]);
    const q = quoteInputSchema.parse({ ...base(), items: [{ ...emptyItem(), description: "Mixer tap" }, { ...emptyItem(), description: "Fitting" }] });
    expect(validateQuoteForSending(q)).toEqual(["2 items still need a price."]);
  });
});
