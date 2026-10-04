import { BillingView } from "@/components/billing/billing-view";
import { requireBusiness } from "@/lib/auth/session";
import { billingConfigured } from "@/lib/billing-config";
import { formatDateOnly } from "@/lib/dates";
import { aiDraftLimit, effectivePlanOf, quoteSendLimit, trialDaysLeft, usagePeriod, type PlanCurrency } from "@/lib/plans";
import { REGIONS, quoteWord } from "@/lib/region";
import { createClient } from "@/lib/supabase/server";
import { localDateOf } from "@/lib/dashboard";

export const metadata = { title: "Billing · Settings · Tradeslip" };

export default async function BillingSettingsPage({ searchParams }: { searchParams: Promise<{ checkout?: string }> }) {
  const { checkout } = await searchParams;
  const business = await requireBusiness();
  const supabase = await createClient();
  const region = REGIONS[business.country];
  const plan = effectivePlanOf(business);

  const { data: counter } = await supabase
    .from("usage_counters")
    .select("quotes_sent, ai_drafts")
    .eq("business_id", business.id)
    .eq("period", usagePeriod(business.timezone))
    .maybeSingle();

  const day = (iso: string | null) => (iso ? formatDateOnly(localDateOf(iso, business.timezone), region.locale) : null);

  return (
    <BillingView
      configured={billingConfigured()}
      currency={region.currency as PlanCurrency}
      plan={plan}
      status={business.subscription_status}
      subscribedPlan={plan === "pro" || plan === "business" ? plan : null}
      cancelAtPeriodEnd={business.cancel_at_period_end}
      trialEndsOn={day(business.trial_ends_at)}
      trialDaysLeft={trialDaysLeft(business, business.timezone)}
      periodEndOn={day(business.current_period_end)}
      hasCustomer={Boolean(business.paddle_customer_id)}
      usage={{
        quotesSent: counter?.quotes_sent ?? 0,
        aiDrafts: counter?.ai_drafts ?? 0,
        quoteLimit: quoteSendLimit(plan),
        aiLimit: aiDraftLimit(plan),
        quoteWord: quoteWord(business.country),
      }}
      returnedFromCheckout={checkout === "success"}
    />
  );
}
