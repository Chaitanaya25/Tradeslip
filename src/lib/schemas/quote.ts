import { z } from "zod";
import { Check } from "./fields";
import { MAX_ITEMS, checkCustomer, checkItems, customerShape, itemShape } from "./document-parts";

/**
 * Quote form schema, shared by the builder (client) and the save action (server).
 * Form values are raw strings; the output is cents / basis points / null.
 * Totals are NOT part of the input: the server always recomputes them.
 */

export { MAX_ITEMS };

export const quoteInputSchema = z
  .object({
    customer: customerShape,
    title: z.string(),
    notes: z.string(),
    valid_until: z.string(),
    deposit_enabled: z.boolean(),
    deposit_percent: z.string(),
    include_photos: z.boolean(),
    // Voice note saved with the draft. Omitted (undefined) = leave as is; "" = clear it.
    voice_note_path: z.string().optional(),
    transcript: z.string().optional(),
    items: z.array(itemShape).max(MAX_ITEMS, `A quote can have up to ${MAX_ITEMS} items.`),
  })
  .transform((v, ctx) => {
    const c = new Check();

    const customer = checkCustomer(c, v.customer);
    const items = checkItems(c, v.items);

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
      voice_note_path: v.voice_note_path === undefined ? undefined : c.text("voice_note_path", v.voice_note_path, { label: "a voice note", max: 200 }) || null,
      transcript: v.transcript === undefined ? undefined : c.text("transcript", v.transcript, { label: "a transcript", max: 5000 }) || null,
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
