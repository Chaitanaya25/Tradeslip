import { redirect } from "next/navigation";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import { getBusiness, requireUser } from "@/lib/auth/session";
import { initialOnboardingValues } from "@/lib/onboarding-defaults";
import { logoPublicUrl } from "@/lib/supabase/storage";

export const metadata = { title: "Set up your business · Tradeslip" };

// Lives outside the (shell) group on purpose: no sidebar while setting up.
export default async function OnboardingPage() {
  const user = await requireUser();
  const business = await getBusiness();
  if (business?.onboarded_at) redirect("/dashboard");

  return (
    <OnboardingWizard
      initialValues={initialOnboardingValues(business, user.email)}
      initialLogoUrl={logoPublicUrl(business?.logo_path)}
    />
  );
}
