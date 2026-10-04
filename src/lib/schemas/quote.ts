import { z } from "zod";
import { Check } from "./fields";
import { PRICE_ITEM_TYPES } from "./price-item";

/**
 * Quote form schema, shared by the builder (client) and the save action (server).
 * Form values are raw strings; the output is cents / basis points / null.
 * Totals are NOT part of the input: the server always recomputes them.
 */

export const MAX_ITEMS = 100;

const customerShape = z.object({
  customer_id: z.string(),
  name: z.string(),
  email: z.string(),
  phone: z.string(),
  address_line1: z.string(),
  city: z.string(),
  region: z.string(),
  postcode: z.string(),
});

const itemShape = z.object({
  description: z.string(),
  type: z.string(),
  qty: z.string(),
  rate: z.string(),
  price_item_id: z.string(),
  needs_price: z.boolean(),
});

export const quoteInputSchema = z
  .object({
    customer: customerShape,
    title: z.string(),
    notes: z.string(),
    valid_until: z.string(),
    deposit_enabled: z.boolean(),
    deposit_percent: z.string(),
    include_photos: z.boolean(),
    items: z.array(itemShape).max(MAX_ITEMS, `A quote can have up to ${MAX_ITEMS} items.`),
  })
  .transform((v, ctx) => {
    const c = new Check();

    const customer = {
      customer_id: c.uuid("customer.customer_id", v.customer.customer_id),
      name: c.text("customer.name", v.customer.name, { label: "the customer's name", required: true, max: 80 }),
      email: c.email("customer.email", v.customer.email) || null,
      phone: c.phone("customer.phone", v.customer.phone) || null,
      address_line1: c.text("customer.address_line1", v.customer.address_line1, { label: "an address", max: 120 }) || null,
      city: c.text("customer.city", v.customer.city, { label: "a city", max: 80 }) || null,
      region: c.text("customer.region", v.customer.region, { label: "a region", max: 80 }) || null,
      postcode: c.text("customer.postcode", v.customer.postcode, { label: "a postcode", max: 20 }) || null,
    };

    // Rows with no description and no rate are just empty rows from "+ Add item": ignore them.
    const items: {
      description: string;
      type: (typeof PRICE_ITEM_TYPES)[number];
      qty: number;
      unit_rate_cents: number;
      price_item_id: string | null;
      needs_price: boolean;
    }[] = [];
    v.items.forEach((item, i) => {
      if (item.description.trim() === "" && item.rate.trim() === "") return;
      const p = `items.${i}`;
      const rate = c.money(`${p}.rate`, item.rate, { required: false });
      items.push({
        description: c.text(`${p}.description`, item.description, { label: "a description", required: true, max: 200 }),
        type: c.oneOf(`${p}.type`, item.type, PRICE_ITEM_TYPES, "Choose a type."),
        qty: c.quantity(`${p}.qty`, item.qty),
        unit_rate_cents: rate,
        price_item_id: c.uuid(`${p}.price_item_id`, item.price_item_id),
        // Once a price is entered the line no longer needs one.
        needs_price: item.needs_price && rate === 0,
      });
    });

    // The percentage is only required while the deposit is switched on.
    let deposit_bps = 3000;
    if (v.deposit_enabled) {
      deposit_bps = c.percent("deposit_percent", v.deposit_percent, {
        required: true,
        mustBePositive: true,
        maxPercent: 100,
        message: "Enter a deposit between 1 and 100.",
      });
    } else if (v.deposit_percent.trim() !== "") {
      // Keep a valid percentage the user typed before switching it off.
      deposit_bps = (() => {
        const check = new Check();
        const bps = check.percent("x", v.deposit_percent, { mustBePositive: true, maxPercent: 100 });
        return check.issues.length === 0 ? bps : 3000;
      })();
    }

    const out = {
      customer,
      title: c.text("title", v.title, { label: "a title", max: 120 }) || null,
      notes: c.text("notes", v.notes, { label: "notes", max: 2000 }) || null,
      valid_until: c.date("valid_until", v.valid_until),
      deposit_enabled: v.deposit_enabled,
      deposit_bps,
      include_photos: v.include_photos,
      items,
    };
    return c.done(ctx, out);
  });

export type QuoteFormValues = z.input<typeof quoteInputSchema>;
export type QuoteInput = z.output<typeof quoteInputSchema>;
export type QuoteItemInput = QuoteInput["items"][number];

export const emptyItem = (): QuoteFormValues["items"][number] => ({
  description: "",
  type: "labour",
  qty: "1",
  rate: "",
  price_item_id: "",
  needs_price: false,
});

export const emptyCustomer = (): QuoteFormValues["customer"] => ({
  customer_id: "",
  name: "",
  email: "",
  phone: "",
  address_line1: "",
  city: "",
  region: "",
  postcode: "",
});

/**
 * Extra rules for a quote that is about to be sent (Phase 5). Drafts may have no
 * items and unpriced lines; a sent quote may not. Returns plain-language problems.
 */
export function validateQuoteForSending(quote: Pick<QuoteInput, "items" | "customer">): string[] {
  const problems: string[] = [];
  if (!quote.customer.name.trim()) problems.push("Add the customer's name.");
  if (quote.items.length === 0) problems.push("Add at least one item.");
  const unpriced = quote.items.filter((i) => i.needs_price || i.unit_rate_cents <= 0).length;
  if (unpriced > 0) problems.push(unpriced === 1 ? "1 item still needs a price." : `${unpriced} items still need a price.`);
  return problems;
}
