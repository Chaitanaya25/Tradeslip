import { describe, expect, it } from "vitest";
import { MAX_DRAFT_ITEMS, MAX_SPOKEN_RATE_CENTS, postprocessDraft, type PostprocessContext, type PriceBookItem } from "./postprocess";
import { aiOutputSchema, parseAiJson, salvageTranscript, type AiItem, type AiOutput } from "./schema";

const book: PriceBookItem[] = [
  { id: "p-mixer-labour", name: "Mixer tap replacement — labour", type: "labour", rate_cents: 12000, markup_bps: 0 },
  { id: "p-leak", name: "Leak repair under sink — labour", type: "labour", rate_cents: 6500, markup_bps: 0 },
  { id: "p-tap", name: "Mixer tap (materials)", type: "material", rate_cents: 8000, markup_bps: 0 },
  { id: "p-pipe", name: "Copper pipe, per metre", type: "material", rate_cents: 1200, markup_bps: 2000 },
  { id: "p-callout", name: "Call-out fee", type: "fee", rate_cents: 4500, markup_bps: 0 },
];

const base = (over: Partial<PostprocessContext> = {}): PostprocessContext => ({
  priceBook: book,
  customers: [],
  business: { calloutFeeCents: 0, taxEnabled: true, taxRateBps: 800 },
  ...over,
});

const ai = (over: Partial<AiOutput> = {}): AiOutput =>
  aiOutputSchema.parse({
    transcript: "Sarah Thompson, 42 Maple Avenue, replace the kitchen mixer tap and fix the leak under the sink, parts about eighty dollars.",
    customer: { name: "Sarah Thompson", address_line1: "42 Maple Avenue" },
    job_title: "Kitchen tap replacement",
    items: [],
    notes: null,
    ...over,
  });

const item = (o: Record<string, unknown>) =>
  ({ description: "x", type: "labour", qty: 1, unit_rate_cents: null, price_item_id: null, ...o }) as AiItem;

describe("parseAiJson / aiOutputSchema", () => {
  it("parses clean JSON", () => {
    const r = parseAiJson(JSON.stringify({ transcript: " hi ", customer: { name: " Tom " }, job_title: "Tap", items: [item({ description: " Fix " })], notes: "  " }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.transcript).toBe("hi");
      expect(r.data.customer.name).toBe("Tom");
      expect(r.data.items[0].description).toBe("Fix");
      expect(r.data.notes).toBeNull();
    }
  });
  it("tolerates code fences and surrounding words", () => {
    expect(parseAiJson('```json\n{"transcript":"a","customer":{},"job_title":"b","items":[]}\n```').ok).toBe(true);
    expect(parseAiJson('Here you go: {"transcript":"a","customer":{},"job_title":"b","items":[]} done').ok).toBe(true);
  });
  it("defaults missing arrays and objects", () => {
    const r = parseAiJson('{"transcript":"nothing understood"}');
    expect(r.ok && r.data.items).toEqual([]);
    expect(r.ok && r.data.customer.name).toBeNull();
  });
  it("coerces numeric strings and clamps quantity", () => {
    const r = aiOutputSchema.parse({ items: [item({ qty: "2.5", unit_rate_cents: "$1,200" }), item({ qty: 99999 }), item({ qty: 0 }), item({ qty: "abc" })] });
    expect(r.items.map((i) => i.qty)).toEqual([2.5, 1000, 0.01, 1]);
    expect(r.items[0].unit_rate_cents).toBe(1200); // already cents; symbols and commas are stripped
  });
  it("nulls negative, junk and fractional-cent prices sensibly", () => {
    const r = aiOutputSchema.parse({ items: [item({ unit_rate_cents: -500 }), item({ unit_rate_cents: "abc" }), item({ unit_rate_cents: 1999.6 }), item({ unit_rate_cents: undefined })] });
    expect(r.items.map((i) => i.unit_rate_cents)).toEqual([null, null, 2000, null]);
  });
  it("turns an unknown item type into labour", () => {
    expect(aiOutputSchema.parse({ items: [item({ type: "service" }), item({ type: "MATERIAL" })] }).items.map((i) => i.type)).toEqual(["labour", "material"]);
  });
  it("rejects malformed output", () => {
    expect(parseAiJson("")).toEqual({ ok: false, reason: "empty" });
    expect(parseAiJson("sorry, I could not do that")).toEqual({ ok: false, reason: "not_json" });
    expect(parseAiJson('{"transcript": "cut off')).toEqual({ ok: false, reason: "not_json" });
    expect(parseAiJson("[1,2,3]")).toEqual({ ok: false, reason: "invalid" });
    expect(parseAiJson("null")).toEqual({ ok: false, reason: "invalid" });
  });
  it("salvages a transcript from broken output", () => {
    expect(salvageTranscript('{"transcript": "Replace the \\"main\\" tap", "items": [')).toBe('Replace the "main" tap');
    expect(salvageTranscript("garbage")).toBe("");
  });
});

describe("postprocessDraft: prices", () => {
  it("overwrites a known item's price and type with the price book, ignoring the AI", () => {
    const d = postprocessDraft(
      ai({ items: [item({ description: "Replace mixer tap", price_item_id: "p-mixer-labour", unit_rate_cents: 99999, type: "fee" })] }),
      base(),
    );
    expect(d.items[0]).toMatchObject({ unit_rate_cents: 12000, type: "labour", price_item_id: "p-mixer-labour", needs_price: false, matched: true });
    expect(d.items[0].description).toBe("Replace mixer tap");
  });
  it("applies markup to price-book materials", () => {
    const d = postprocessDraft(ai({ items: [item({ description: "Copper pipe", price_item_id: "p-pipe", qty: 3, type: "material", unit_rate_cents: 1 })] }), base());
    expect(d.items[0].unit_rate_cents).toBe(1440);
    expect(d.totals.subtotalCents).toBe(4320);
  });
  it("nulls a hallucinated id and flags the item when there is no spoken price", () => {
    const d = postprocessDraft(ai({ items: [item({ description: "Flux capacitor", price_item_id: "not-in-book" })] }), base());
    expect(d.items[0]).toMatchObject({ price_item_id: null, unit_rate_cents: 0, needs_price: true, matched: false });
  });
  it("treats an archived item (absent from the active price book) like a hallucinated id", () => {
    const d = postprocessDraft(ai({ items: [item({ description: "Old thing", price_item_id: "archived-1", unit_rate_cents: 5000 })] }), base());
    expect(d.items[0]).toMatchObject({ price_item_id: null, unit_rate_cents: 5000, needs_price: false });
  });
  it("keeps a spoken price on an unmatched item", () => {
    const d = postprocessDraft(ai({ items: [item({ description: "Parts", type: "material", unit_rate_cents: 8000 })] }), base());
    expect(d.items[0]).toMatchObject({ unit_rate_cents: 8000, needs_price: false, price_item_id: null, matched: false });
  });
  it("flags an unmatched item with no price", () => {
    const d = postprocessDraft(ai({ items: [item({ description: "Seal the gap" })] }), base());
    expect(d.items[0]).toMatchObject({ unit_rate_cents: 0, needs_price: true });
  });
  it("rejects negative and absurd spoken prices", () => {
    const d = postprocessDraft(
      ai({ items: [item({ description: "A", unit_rate_cents: -100 }), item({ description: "B", unit_rate_cents: MAX_SPOKEN_RATE_CENTS + 1 }), item({ description: "C", unit_rate_cents: MAX_SPOKEN_RATE_CENTS })] }),
      base(),
    );
    expect(d.items.map((i) => [i.unit_rate_cents, i.needs_price])).toEqual([[0, true], [0, true], [MAX_SPOKEN_RATE_CENTS, false]]);
  });
  it("drops empty descriptions and caps the item count", () => {
    expect(postprocessDraft(ai({ items: [item({ description: "   " }), item({ description: "Real" })] }), base()).items).toHaveLength(1);
    const many = Array.from({ length: 80 }, (_, i) => item({ description: `Item ${i}` }));
    expect(postprocessDraft(ai({ items: many }), base()).items).toHaveLength(MAX_DRAFT_ITEMS);
  });
  it("computes the example job's totals in integer cents", () => {
    const d = postprocessDraft(
      ai({
        items: [
          item({ description: "Replace mixer tap", price_item_id: "p-mixer-labour" }),
          item({ description: "Fix leak under sink", price_item_id: "p-leak" }),
          item({ description: "Parts", type: "material", unit_rate_cents: 8000 }),
        ],
      }),
      base(),
    );
    expect(d.totals).toEqual({ subtotalCents: 26500, taxCents: 2120, totalCents: 28620 });
    expect(d.matchedCount).toBe(2);
  });
});

describe("postprocessDraft: call-out", () => {
  const visit = "Go out to Tom Hughes at 3 Brook Street and do an inspection of the boiler.";
  it("adds nothing for an ordinary job even if the business has a fee", () => {
    const d = postprocessDraft(ai({ items: [item({ description: "Fix tap", price_item_id: "p-leak" })] }), base({ business: { calloutFeeCents: 4500, taxEnabled: true, taxRateBps: 800 } }));
    expect(d.items.some((i) => /call-out/i.test(i.description))).toBe(false);
  });
  it("adds the price-book call-out when the speaker mentions it", () => {
    const d = postprocessDraft(ai({ transcript: "Fix the tap plus a call-out fee", items: [item({ description: "Fix tap", price_item_id: "p-leak" })] }), base());
    expect(d.items.at(-1)).toMatchObject({ description: "Call-out fee", unit_rate_cents: 4500, price_item_id: "p-callout", type: "fee" });
  });
  it("uses the business fee when there is no price-book call-out item", () => {
    const d = postprocessDraft(ai({ transcript: "include the callout", items: [] }), base({ priceBook: [], business: { calloutFeeCents: 5500, taxEnabled: false, taxRateBps: 0 } }));
    expect(d.items).toEqual([expect.objectContaining({ description: "Call-out fee", unit_rate_cents: 5500, needs_price: false })]);
  });
  it("flags the call-out when it is mentioned but nothing sets its price", () => {
    const d = postprocessDraft(ai({ transcript: "plus the call-out", items: [] }), base({ priceBook: [] }));
    expect(d.items[0]).toMatchObject({ unit_rate_cents: 0, needs_price: true });
  });
  it("adds a call-out for a clear site visit when the business charges one", () => {
    const d = postprocessDraft(ai({ transcript: visit, items: [item({ description: "Inspect boiler" })] }), base({ business: { calloutFeeCents: 4500, taxEnabled: true, taxRateBps: 800 } }));
    expect(d.items.at(-1)?.description).toBe("Call-out fee");
  });
  it("does not add a site-visit call-out when the business has no fee", () => {
    const d = postprocessDraft(ai({ transcript: visit, items: [item({ description: "Inspect boiler" })] }), base());
    expect(d.items).toHaveLength(1);
  });
  it("never duplicates a call-out the AI already produced", () => {
    const d = postprocessDraft(
      ai({ transcript: "come out for a call-out", items: [item({ description: "Call out charge", price_item_id: "p-callout" })] }),
      base({ business: { calloutFeeCents: 4500, taxEnabled: true, taxRateBps: 800 } }),
    );
    expect(d.items.filter((i) => /call[\s-]?out/i.test(i.description))).toHaveLength(1);
  });
});

describe("postprocessDraft: customer", () => {
  const customers = [{ id: "c1", name: "Sarah Thompson", phone: "(413) 555-0182", postcode: "01103" }];
  it("returns the id of an existing customer matched on name + phone", () => {
    const d = postprocessDraft(ai({ customer: { name: "sarah thompson", phone: "413-555-0182", email: null, address_line1: "42 Maple Avenue", city: null, region: null, postcode: null } }), base({ customers }));
    expect(d.customer.customer_id).toBe("c1");
    expect(d.customer.address_line1).toBe("42 Maple Avenue");
  });
  it("does not match on name alone, or a different phone", () => {
    expect(postprocessDraft(ai({ customer: { name: "Sarah Thompson", phone: null, email: null, address_line1: null, city: null, region: null, postcode: null } }), base({ customers })).customer.customer_id).toBeNull();
    expect(postprocessDraft(ai({ customer: { name: "Sarah Thompson", phone: "999 999 9999", email: null, address_line1: null, city: null, region: null, postcode: "99999" } }), base({ customers })).customer.customer_id).toBeNull();
  });
  it("returns blank strings for details that were not spoken", () => {
    const d = postprocessDraft(ai({ customer: { name: null, phone: null, email: null, address_line1: null, city: null, region: null, postcode: null } }), base());
    expect(d.customer).toEqual({ customer_id: null, name: "", email: "", phone: "", address_line1: "", city: "", region: "", postcode: "" });
  });
  it("handles an unintelligible note: no items, transcript kept", () => {
    const d = postprocessDraft(aiOutputSchema.parse({ transcript: "I could not make out anything in this recording." }), base());
    expect(d.items).toEqual([]);
    expect(d.totals.totalCents).toBe(0);
    expect(d.transcript).toMatch(/could not/);
  });
});
