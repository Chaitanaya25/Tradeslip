import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { getBusiness, requireUser } from "@/lib/auth/session";
import { displayNameFor, initialsFor } from "@/lib/display-name";
import { planBannerFor } from "@/lib/plan-banner";
import { createClient } from "@/lib/supabase/server";
import { REGIONS, quoteWord } from "@/lib/region";
import { usagePeriod } from "@/lib/plans";

// Everything inside the shell needs a finished business. /onboarding sits
// outside this group, so it never renders the sidebar.
export default async function ShellLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const business = await getBusiness();
  if (!business?.onboarded_at) redirect("/onboarding");

  // One small read: this month's sent quotes, for the "2 of 3 used" nudge on the free plan.
  const supabase = await createClient();
  const { data: counter } = await supabase
    .from("usage_counters")
    .select("quotes_sent")
    .eq("business_id", business.id)
    .eq("period", usagePeriod(business.timezone))
    .maybeSingle();
  const banner = planBannerFor(business, { quotesSent: counter?.quotes_sent ?? 0, quoteWord: quoteWord(business.country) });

  const name = displayNameFor({ fullName: user.user_metadata?.full_name, email: user.email });

  return (
    <AppShell
      user={{ name, initials: initialsFor(name), businessName: business.name }}
      money={{ currency: business.currency, locale: REGIONS[business.country].locale }}
      banner={banner}
    >
      {children}
    </AppShell>
  );
}
