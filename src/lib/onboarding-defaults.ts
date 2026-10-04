import { formatBpsAsPercent, formatCentsForInput } from "./money-input";
import { REGIONS } from "./region";
import type { OnboardingInput } from "./schemas/onboarding";
import type { Business } from "./supabase/tables";
import { TRADES } from "./trade-seeds";

type Draft = Pick<
  Business,
  | "name" | "trade" | "country" | "phone" | "email"
  | "default_hourly_rate_cents" | "callout_fee_cents" | "tax_enabled" | "tax_rate_bps" | "tax_number"
  | "payment_terms_days" | "quote_validity_days" | "payment_link_url"
>;

/**
 * Starting values for the wizard. With a saved draft (user left halfway) the form
 * resumes from it; otherwise it starts blank, with the email from their sign-in.
 */
export function initialOnboardingValues(draft: Draft | null, authEmail: string | undefined): OnboardingInput {
  if (!draft) {
    return {
      name: "",
      trade: "",
      country: "US",
      phone: "",
      email: authEmail ?? "",
      timezone: "",
      hourly_rate: "",
      callout_fee: "",
      tax_registered: false,
      tax_rate: "",
      tax_number: "",
      payment_terms_days: "14",
      quote_validity_days: "30",
      payment_link_url: "",
    };
  }

  const country = draft.country in REGIONS ? draft.country : "US";
  return {
    name: draft.name,
    trade: (TRADES as readonly string[]).includes(draft.trade ?? "") ? (draft.trade as string) : "",
    country,
    phone: draft.phone ?? "",
    email: draft.email ?? authEmail ?? "",
    timezone: "",
    hourly_rate: draft.default_hourly_rate_cents > 0 ? formatCentsForInput(draft.default_hourly_rate_cents) : "",
    callout_fee: draft.callout_fee_cents > 0 ? formatCentsForInput(draft.callout_fee_cents) : "",
    tax_registered: draft.tax_enabled,
    tax_rate: draft.tax_enabled ? formatBpsAsPercent(draft.tax_rate_bps) : "",
    tax_number: draft.tax_number ?? "",
    payment_terms_days: String(draft.payment_terms_days),
    quote_validity_days: String(draft.quote_validity_days),
    payment_link_url: draft.payment_link_url ?? "",
  };
}
