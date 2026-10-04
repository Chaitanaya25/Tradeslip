import { z } from "zod";
import { Check } from "./fields";
import { PRICE_ITEM_TYPES } from "./price-item";

/** Customer and line-item fields shared by the quote and invoice forms. */

export const MAX_ITEMS = 100;

export const customerShape = z.object({
  customer_id: z.string(),
  name: z.string(),
  email: z.string(),
  phone: z.string(),
  address_line1: z.string(),
  city: z.string(),
  region: z.string(),
  postcode: z.string(),
});

export const itemShape = z.object({
  description: z.string(),
  type: z.string(),
  qty: z.string(),
  rate: z.string(),
  price_item_id: z.string(),
  needs_price: z.boolean(),
});

export type CustomerFormValues = z.input<typeof customerShape>;
export type ItemFormValues = z.input<typeof itemShape>;

export function checkCustomer(c: Check, v: CustomerFormValues) {
  return {
    customer_id: c.uuid("customer.customer_id", v.customer_id),
    name: c.text("customer.name", v.name, { label: "the customer's name", required: true, max: 80 }),
    email: c.email("customer.email", v.email) || null,
    phone: c.phone("customer.phone", v.phone) || null,
    address_line1: c.text("customer.address_line1", v.address_line1, { label: "an address", max: 120 }) || null,
    city: c.text("customer.city", v.city, { label: "a city", max: 80 }) || null,
    region: c.text("customer.region", v.region, { label: "a region", max: 80 }) || null,
    postcode: c.text("customer.postcode", v.postcode, { label: "a postcode", max: 20 }) || null,
  };
}

export type CheckedItem = {
  description: string;
  type: (typeof PRICE_ITEM_TYPES)[number];
  qty: number;
  unit_rate_cents: number;
  price_item_id: string | null;
  needs_price: boolean;
};

/** Rows with no description and no rate are just empty rows from "+ Add item": ignored. */
export function checkItems(c: Check, rows: readonly ItemFormValues[]): CheckedItem[] {
  const items: CheckedItem[] = [];
  rows.forEach((item, i) => {
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
  return items;
}
