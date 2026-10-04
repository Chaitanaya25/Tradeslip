import { z } from "zod";
import { Check } from "./fields";

/** Customer form (new + edit). Raw strings in, trimmed values / null out. */
export const customerInputSchema = z
  .object({
    name: z.string(),
    email: z.string(),
    phone: z.string(),
    address_line1: z.string(),
    city: z.string(),
    region: z.string(),
    postcode: z.string(),
    notes: z.string(),
    /** "Save anyway" after the duplicate warning. */
    allow_duplicate: z.boolean().optional(),
  })
  .transform((v, ctx) => {
    const c = new Check();
    const out = {
      name: c.text("name", v.name, { label: "the customer's name", required: true, max: 80 }),
      email: c.email("email", v.email) || null,
      phone: c.phone("phone", v.phone) || null,
      address_line1: c.text("address_line1", v.address_line1, { label: "an address", max: 120 }) || null,
      city: c.text("city", v.city, { label: "a city", max: 80 }) || null,
      region: c.text("region", v.region, { label: "a region", max: 80 }) || null,
      postcode: c.text("postcode", v.postcode, { label: "a postcode", max: 20 }) || null,
      notes: c.text("notes", v.notes, { label: "notes", max: 2000 }) || null,
      allow_duplicate: v.allow_duplicate === true,
    };
    return c.done(ctx, out);
  });

export type CustomerFormValues = z.input<typeof customerInputSchema>;
export type CustomerInput = z.output<typeof customerInputSchema>;

export const emptyCustomerForm = (): CustomerFormValues => ({
  name: "",
  email: "",
  phone: "",
  address_line1: "",
  city: "",
  region: "",
  postcode: "",
  notes: "",
});
