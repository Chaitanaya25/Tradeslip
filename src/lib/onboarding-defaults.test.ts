import { describe, expect, it } from "vitest";
import { initialOnboardingValues } from "./onboarding-defaults";
import { step1Schema, step2Schema } from "./schemas/onboarding";

describe("initialOnboardingValues", () => {
  it("starts blank with the sign-in email", () => {
    const v = initialOnboardingValues(null, "dave@example.com");
    expect(v).toMatchObject({ email: "dave@example.com", country: "US", name: "", tax_registered: false });
    expect(v.payment_terms_days).toBe("14");
  });
  it("resumes from a saved draft and round-trips money", () => {
    const v = initialOnboardingValues(
      {
        name: "Miller Plumbing", trade: "Plumber", country: "UK", phone: "01632 960123", email: "a@b.co",
        default_hourly_rate_cents: 8550, callout_fee_cents: 0, tax_enabled: true, tax_rate_bps: 2000, tax_number: "GB1",
        payment_terms_days: 7, quote_validity_days: 14, payment_link_url: "https://pay.example.com/x",
      },
      "ignored@example.com",
    );
    expect(v).toMatchObject({ hourly_rate: "85.50", callout_fee: "", tax_rate: "20", country: "UK", email: "a@b.co" });
    expect(step2Schema.parse(v).default_hourly_rate_cents).toBe(8550);
    expect(step1Schema.safeParse(v).success).toBe(true);
  });
  it("drops a trade that is not in the list", () => {
    const v = initialOnboardingValues(
      {
        name: "X", trade: "Wizard", country: "AU", phone: null, email: null,
        default_hourly_rate_cents: 0, callout_fee_cents: 0, tax_enabled: false, tax_rate_bps: 0, tax_number: null,
        payment_terms_days: 14, quote_validity_days: 30, payment_link_url: null,
      },
      "me@example.com",
    );
    expect(v.trade).toBe("");
    expect(v.email).toBe("me@example.com");
  });
});
