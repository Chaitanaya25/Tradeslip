import { describe, expect, it } from "vitest";
import { parseOnboarding, step1Schema, step2Schema, step3Schema, type OnboardingInput } from "./onboarding";
import { priceItemSchema } from "./price-item";
import { numberingSchema, paymentLinkSchema, profileSchema, regionalSchema } from "./settings";

function errors(result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) {
  if (result.success) return {};
  return Object.fromEntries(result.error!.issues.map((i) => [String(i.path[0]), i.message]));
}

const step1 = { name: "Miller Plumbing", trade: "Plumber", country: "US", phone: "(413) 555-0142", email: "dave@example.com", timezone: "America/New_York" };
const step2 = {
  hourly_rate: "95",
  callout_fee: "45",
  tax_registered: true,
  tax_rate: "8",
  tax_number: "",
  payment_terms_days: "14",
  quote_validity_days: "30",
};

describe("onboarding step 1", () => {
  it("accepts valid business details", () => {
    const r = step1Schema.safeParse(step1);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toMatchObject({ name: "Miller Plumbing", country: "US", trade: "Plumber" });
  });
  it("reports every problem in one pass", () => {
    const e = errors(step1Schema.safeParse({ name: " ", trade: "Wizard", country: "FR", phone: "x", email: "nope" }));
    expect(Object.keys(e).sort()).toEqual(["country", "email", "name", "phone", "trade"]);
    expect(e.name).toBe("Enter your business name.");
    expect(e.email).toMatch(/full email/);
  });
  it("trims and keeps an optional browser timezone", () => {
    const r = step1Schema.parse({ ...step1, name: "  Miller Plumbing  ", timezone: undefined });
    expect(r.name).toBe("Miller Plumbing");
    expect(r.timezone).toBe("");
  });
});

describe("onboarding step 2", () => {
  it("converts dollars to cents and percent to basis points", () => {
    expect(step2Schema.parse(step2)).toEqual({
      default_hourly_rate_cents: 9500,
      callout_fee_cents: 4500,
      tax_enabled: true,
      tax_rate_bps: 800,
      tax_number: null,
      payment_terms_days: 14,
      quote_validity_days: 30,
    });
  });
  it("handles 20% VAT and a VAT number", () => {
    const r = step2Schema.parse({ ...step2, tax_rate: "20", tax_number: " GB123456789 " });
    expect(r.tax_rate_bps).toBe(2000);
    expect(r.tax_number).toBe("GB123456789");
  });
  it("treats a blank call-out fee as zero and ignores the rate when not registered", () => {
    const r = step2Schema.parse({ ...step2, callout_fee: "", tax_registered: false, tax_rate: "garbage" });
    expect(r.callout_fee_cents).toBe(0);
    expect(r.tax_enabled).toBe(false);
    expect(r.tax_rate_bps).toBe(0);
  });
  it("requires an hourly rate above zero and a tax rate when registered", () => {
    const e = errors(step2Schema.safeParse({ ...step2, hourly_rate: "0", tax_rate: "" }));
    expect(e.hourly_rate).toMatch(/amount/);
    expect(e.tax_rate).toMatch(/tax rate/);
  });
  it("rejects amounts with too many decimals and unknown terms", () => {
    const e = errors(step2Schema.safeParse({ ...step2, callout_fee: "45.999", payment_terms_days: "21", quote_validity_days: "7" }));
    expect(Object.keys(e).sort()).toEqual(["callout_fee", "payment_terms_days", "quote_validity_days"]);
  });
});

describe("onboarding step 3", () => {
  it("allows blank (skip)", () => {
    expect(step3Schema.parse({ payment_link_url: "" })).toEqual({ payment_link_url: null });
    expect(step3Schema.parse({ payment_link_url: "   " })).toEqual({ payment_link_url: null });
  });
  it("accepts https links", () => {
    expect(step3Schema.parse({ payment_link_url: "https://buy.stripe.com/abc123" }).payment_link_url).toBe(
      "https://buy.stripe.com/abc123",
    );
  });
  it.each(["http://pay.example.com/x", "pay.example.com", "javascript:alert(1)", "https://localhost", "not a url"])(
    "rejects %s",
    (value) => {
      expect(errors(step3Schema.safeParse({ payment_link_url: value })).payment_link_url).toMatch(/https/);
    },
  );
});

describe("parseOnboarding", () => {
  const all: OnboardingInput = { ...step1, ...step2, payment_link_url: "" };
  it("merges the three steps", () => {
    const r = parseOnboarding(all);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.default_hourly_rate_cents).toBe(9500);
      expect(r.data.payment_link_url).toBeNull();
      expect(r.data.country).toBe("US");
    }
  });
  it("collects errors from every step", () => {
    const r = parseOnboarding({ ...all, name: "", hourly_rate: "x", payment_link_url: "http://a.b" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["hourly_rate", "name", "payment_link_url"]);
  });
});

describe("price item schema", () => {
  const item = { name: "Mixer tap", type: "material", unit: "item", rate: "80", markup: "20" };
  it("parses a material with markup", () => {
    expect(priceItemSchema.parse(item)).toEqual({ name: "Mixer tap", type: "material", unit: "item", rate_cents: 8000, markup_bps: 2000 });
  });
  it("ignores markup for labour and fees", () => {
    expect(priceItemSchema.parse({ ...item, type: "labour", unit: "hour", markup: "50" }).markup_bps).toBe(0);
    expect(priceItemSchema.parse({ ...item, type: "fee", markup: "50" }).markup_bps).toBe(0);
  });
  it("treats blank markup as 0 and accepts decimals", () => {
    expect(priceItemSchema.parse({ ...item, markup: "" }).markup_bps).toBe(0);
    expect(priceItemSchema.parse({ ...item, markup: undefined }).markup_bps).toBe(0);
    expect(priceItemSchema.parse({ ...item, markup: "12.5" }).markup_bps).toBe(1250);
    expect(priceItemSchema.parse({ ...item, rate: "$1,234.50" }).rate_cents).toBe(123450);
  });
  it("flags every bad field", () => {
    const e = errors(priceItemSchema.safeParse({ name: "", type: "stuff", unit: "mile", rate: "0", markup: "" }));
    expect(Object.keys(e).sort()).toEqual(["name", "rate", "type", "unit"]);
    expect(errors(priceItemSchema.safeParse({ ...item, markup: "1001" })).markup).toMatch(/markup/);
    expect(errors(priceItemSchema.safeParse({ ...item, rate: "-5" })).rate).toMatch(/amount/);
  });
});

describe("settings schemas", () => {
  it("profile: required name and email, optional the rest", () => {
    const ok = profileSchema.parse({ owner_name: "", name: "Miller Plumbing", trade: "Plumber", phone: "", email: "a@b.co", address_line1: "", city: "", region: "", postcode: "" });
    expect(ok.name).toBe("Miller Plumbing");
    expect(errors(profileSchema.safeParse({ owner_name: "", name: "", trade: "Plumber", phone: "abc", email: "", address_line1: "", city: "", region: "", postcode: "" }))).toMatchObject({
      name: expect.any(String),
      phone: expect.any(String),
      email: expect.any(String),
    });
  });
  it("profile output never contains plan, billing, country or currency", () => {
    const out = profileSchema.parse({ owner_name: "", name: "X", trade: "Other", phone: "", email: "a@b.co", address_line1: "", city: "", region: "", postcode: "", plan: "business", country: "AU", currency: "AUD" } as never);
    expect(Object.keys(out).sort()).toEqual(["address_line1", "city", "email", "name", "owner_name", "phone", "postcode", "region", "trade"]);
  });
  it("regional: tax toggle, rate and label", () => {
    expect(regionalSchema.parse({ tax_enabled: true, tax_label: "VAT", tax_rate: "20", tax_number: "GB1" })).toEqual({
      tax_enabled: true,
      tax_label: "VAT",
      tax_rate_bps: 2000,
      tax_number: "GB1",
    });
    expect(regionalSchema.parse({ tax_enabled: false, tax_label: "GST", tax_rate: "", tax_number: "" }).tax_rate_bps).toBe(0);
    expect(errors(regionalSchema.safeParse({ tax_enabled: true, tax_label: "", tax_rate: "0", tax_number: "" }))).toMatchObject({
      tax_label: expect.any(String),
      tax_rate: expect.any(String),
    });
  });
  it("numbering: prefixes, rates and defaults", () => {
    const ok = numberingSchema.parse({ quote_prefix: "QU-", invoice_prefix: "INV-", hourly_rate: "95", callout_fee: "", payment_terms_days: "7", quote_validity_days: "14" });
    expect(ok).toEqual({ quote_prefix: "QU-", invoice_prefix: "INV-", default_hourly_rate_cents: 9500, callout_fee_cents: 0, payment_terms_days: 7, quote_validity_days: 14 });
    const e = errors(numberingSchema.safeParse({ quote_prefix: "bad prefix!", invoice_prefix: "WAYTOOLONGPREFIX", hourly_rate: "", callout_fee: "x", payment_terms_days: "3", quote_validity_days: "30" }));
    expect(Object.keys(e).sort()).toEqual(["callout_fee", "hourly_rate", "invoice_prefix", "payment_terms_days", "quote_prefix"]);
  });
  it("payment link: https only, blank clears", () => {
    expect(paymentLinkSchema.parse({ payment_link_url: "" }).payment_link_url).toBeNull();
    expect(paymentLinkSchema.parse({ payment_link_url: "https://paypal.me/miller" }).payment_link_url).toBe("https://paypal.me/miller");
    expect(errors(paymentLinkSchema.safeParse({ payment_link_url: "http://paypal.me/miller" })).payment_link_url).toMatch(/https/);
  });
});
