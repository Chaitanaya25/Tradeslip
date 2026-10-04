import { z } from "zod";
import { TRADES } from "@/lib/trade-seeds";
import { Check, PAYMENT_TERMS_OPTIONS, QUOTE_VALIDITY_OPTIONS } from "./fields";

/**
 * One schema per settings section. Each output type is an explicit whitelist of
 * columns the section may write: plan, billing, country and currency are never
 * in any of them, so a forged request cannot change them.
 */

export const profileSchema = z
  .object({
    owner_name: z.string(),
    name: z.string(),
    trade: z.string(),
    phone: z.string(),
    email: z.string(),
    address_line1: z.string(),
    city: z.string(),
    region: z.string(),
    postcode: z.string(),
  })
  .transform((v, ctx) => {
    const c = new Check();
    const out = {
      owner_name: c.text("owner_name", v.owner_name, { label: "your name", max: 80 }),
      name: c.text("name", v.name, { label: "your business name", required: true, max: 80 }),
      trade: c.oneOf("trade", v.trade, TRADES, "Choose your trade."),
      phone: c.phone("phone", v.phone),
      email: c.email("email", v.email, { required: true }),
      address_line1: c.text("address_line1", v.address_line1, { label: "an address", max: 120 }),
      city: c.text("city", v.city, { label: "a city", max: 80 }),
      region: c.text("region", v.region, { label: "a region", max: 80 }),
      postcode: c.text("postcode", v.postcode, { label: "a postcode", max: 20 }),
    };
    return c.done(ctx, out);
  });

export const regionalSchema = z
  .object({
    tax_enabled: z.boolean(),
    tax_label: z.string(),
    tax_rate: z.string(),
    tax_number: z.string(),
  })
  .transform((v, ctx) => {
    const c = new Check();
    const out = {
      tax_enabled: v.tax_enabled,
      tax_label: c.text("tax_label", v.tax_label, { label: "a tax name, like VAT", required: true, max: 30 }),
      tax_rate_bps: v.tax_enabled
        ? c.percent("tax_rate", v.tax_rate, { required: true, mustBePositive: true, message: "Enter your tax rate, like 8 or 20." })
        : 0,
      tax_number: c.text("tax_number", v.tax_number, { label: "a number", max: 30 }) || null,
    };
    return c.done(ctx, out);
  });

export const numberingSchema = z
  .object({
    quote_prefix: z.string(),
    invoice_prefix: z.string(),
    hourly_rate: z.string(),
    callout_fee: z.string(),
    payment_terms_days: z.string(),
    quote_validity_days: z.string(),
  })
  .transform((v, ctx) => {
    const c = new Check();
    const out = {
      quote_prefix: c.prefix("quote_prefix", v.quote_prefix),
      invoice_prefix: c.prefix("invoice_prefix", v.invoice_prefix),
      default_hourly_rate_cents: c.money("hourly_rate", v.hourly_rate, { required: true, minCents: 1 }),
      callout_fee_cents: c.money("callout_fee", v.callout_fee, { required: false }),
      payment_terms_days: c.days("payment_terms_days", v.payment_terms_days, PAYMENT_TERMS_OPTIONS, "Choose payment terms."),
      quote_validity_days: c.days("quote_validity_days", v.quote_validity_days, QUOTE_VALIDITY_OPTIONS, "Choose how long quotes stay valid."),
    };
    return c.done(ctx, out);
  });

export const paymentLinkSchema = z.object({ payment_link_url: z.string() }).transform((v, ctx) => {
  const c = new Check();
  const out = { payment_link_url: c.httpsUrl("payment_link_url", v.payment_link_url) };
  return c.done(ctx, out);
});

export type ProfileInput = z.input<typeof profileSchema>;
export type RegionalInput = z.input<typeof regionalSchema>;
export type NumberingInput = z.input<typeof numberingSchema>;
export type PaymentLinkInput = z.input<typeof paymentLinkSchema>;
