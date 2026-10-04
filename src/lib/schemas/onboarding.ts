import { z } from "zod";
import { REGIONS, type Country } from "@/lib/region";
import { TRADES } from "@/lib/trade-seeds";
import { Check, PAYMENT_TERMS_OPTIONS, QUOTE_VALIDITY_OPTIONS } from "./fields";

export const COUNTRIES = ["US", "UK", "AU"] as const satisfies readonly Country[];

/** Step 1: business. The logo is uploaded separately, straight to storage. */
export const step1Schema = z
  .object({
    name: z.string(),
    trade: z.string(),
    country: z.string(),
    phone: z.string(),
    email: z.string(),
    timezone: z.string().optional(),
  })
  .transform((v, ctx) => {
    const c = new Check();
    const out = {
      name: c.text("name", v.name, { label: "your business name", required: true, max: 80 }),
      trade: c.oneOf("trade", v.trade, TRADES, "Choose your trade."),
      country: c.oneOf("country", v.country, COUNTRIES, "Choose your country."),
      phone: c.phone("phone", v.phone, { required: true }),
      email: c.email("email", v.email, { required: true }),
      timezone: (v.timezone ?? "").trim(),
    };
    return c.done(ctx, out);
  });

/** Step 2: pricing defaults. Money is typed in pounds/dollars, stored as cents. */
export const step2Schema = z
  .object({
    hourly_rate: z.string(),
    callout_fee: z.string(),
    tax_registered: z.boolean(),
    tax_rate: z.string(),
    tax_number: z.string(),
    payment_terms_days: z.string(),
    quote_validity_days: z.string(),
  })
  .transform((v, ctx) => {
    const c = new Check();
    const registered = v.tax_registered;
    const out = {
      default_hourly_rate_cents: c.money("hourly_rate", v.hourly_rate, { required: true, minCents: 1 }),
      callout_fee_cents: c.money("callout_fee", v.callout_fee, { required: false }),
      tax_enabled: registered,
      tax_rate_bps: registered
        ? c.percent("tax_rate", v.tax_rate, { required: true, mustBePositive: true, message: "Enter your tax rate, like 8 or 20." })
        : 0,
      tax_number: c.text("tax_number", v.tax_number, { label: "a number", max: 30 }) || null,
      payment_terms_days: c.days("payment_terms_days", v.payment_terms_days, PAYMENT_TERMS_OPTIONS, "Choose payment terms."),
      quote_validity_days: c.days("quote_validity_days", v.quote_validity_days, QUOTE_VALIDITY_OPTIONS, "Choose how long quotes stay valid."),
    };
    return c.done(ctx, out);
  });

/** Step 3: optional payment link. */
export const step3Schema = z
  .object({ payment_link_url: z.string() })
  .transform((v, ctx) => {
    const c = new Check();
    const out = { payment_link_url: c.httpsUrl("payment_link_url", v.payment_link_url) };
    return c.done(ctx, out);
  });

export type Step1Input = z.input<typeof step1Schema>;
export type Step2Input = z.input<typeof step2Schema>;
export type Step3Input = z.input<typeof step3Schema>;
export type Step1Output = z.output<typeof step1Schema>;
export type Step2Output = z.output<typeof step2Schema>;
export type Step3Output = z.output<typeof step3Schema>;

/** Everything the wizard collects, as raw form values. */
export type OnboardingInput = Step1Input & Step2Input & Step3Input;

export type OnboardingOutput = Step1Output & Step2Output & Step3Output;

export type ParseResult<T> = { ok: true; data: T } | { ok: false; errors: Record<string, string> };

/** Validate all three steps (the server never trusts that the client validated). */
export function parseOnboarding(raw: OnboardingInput): ParseResult<OnboardingOutput> {
  const results = [step1Schema.safeParse(raw), step2Schema.safeParse(raw), step3Schema.safeParse(raw)] as const;
  const errors: Record<string, string> = {};
  for (const r of results) {
    if (!r.success) {
      for (const issue of r.error.issues) errors[String(issue.path[0] ?? "_form")] ??= issue.message;
    }
  }
  if (!results[0].success || !results[1].success || !results[2].success) return { ok: false, errors };
  return { ok: true, data: { ...results[0].data, ...results[1].data, ...results[2].data } };
}

/** Per-region wizard defaults (tax rate suggestion, etc). */
export function regionDefaults(country: Country) {
  const region = REGIONS[country];
  return { taxRatePercent: region.defaultTaxBps > 0 ? String(region.defaultTaxBps / 100) : "" };
}
