import { z } from "zod";
import { Check } from "./fields";

export const PRICE_ITEM_TYPES = ["labour", "material", "fee"] as const;
export const PRICE_ITEM_UNITS = ["job", "hour", "item", "m2", "m", "day"] as const;

export const TYPE_LABELS: Record<(typeof PRICE_ITEM_TYPES)[number], string> = {
  labour: "Labour",
  material: "Material",
  fee: "Fee",
};

export const UNIT_LABELS: Record<(typeof PRICE_ITEM_UNITS)[number], string> = {
  job: "job",
  hour: "hour",
  item: "item",
  m2: "m²",
  m: "m",
  day: "day",
};

/** Add/edit form for the price book. `rate` and `markup` are typed text; output is cents / bps. */
export const priceItemSchema = z
  .object({
    name: z.string(),
    type: z.string(),
    unit: z.string(),
    rate: z.string(),
    markup: z.string().optional(),
  })
  .transform((v, ctx) => {
    const c = new Check();
    const type = c.oneOf("type", v.type, PRICE_ITEM_TYPES, "Choose a type.");
    const out = {
      name: c.text("name", v.name, { label: "a name", required: true, max: 80 }),
      type,
      unit: c.oneOf("unit", v.unit, PRICE_ITEM_UNITS, "Choose a unit."),
      rate_cents: c.money("rate", v.rate, { required: true, minCents: 1 }),
      // Markup only applies to materials; other types always store 0.
      markup_bps:
        type === "material"
          ? c.percent("markup", v.markup ?? "", { required: false, maxPercent: 1000, message: "Enter a markup like 20 or 12.5." })
          : 0,
    };
    return c.done(ctx, out);
  });

export type PriceItemInput = z.input<typeof priceItemSchema>;
export type PriceItemOutput = z.output<typeof priceItemSchema>;
