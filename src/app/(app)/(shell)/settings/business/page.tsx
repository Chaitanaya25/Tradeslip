import { LogoSettings } from "@/components/settings/logo-settings";
import { ProfileForm } from "@/components/settings/profile-form";
import { requireBusiness, requireUser } from "@/lib/auth/session";
import { REGIONS } from "@/lib/region";
import { TRADES } from "@/lib/trade-seeds";

export const metadata = { title: "Business profile · Settings · Tradeslip" };

export default async function BusinessSettingsPage() {
  const user = await requireUser();
  const business = await requireBusiness();
  const region = REGIONS[business.country];
  const fullName = user.user_metadata?.full_name;

  return (
    <>
      <LogoSettings businessId={business.id} businessName={business.name} initialLogoPath={business.logo_path} />
      <ProfileForm
        regionLabel={region.address.regionLabel}
        postcodeLabel={region.address.postcodeLabel}
        initial={{
          owner_name: typeof fullName === "string" ? fullName : "",
          name: business.name,
          trade: (TRADES as readonly string[]).includes(business.trade ?? "") ? (business.trade as string) : "Other",
          phone: business.phone ?? "",
          email: business.email ?? "",
          address_line1: business.address_line1 ?? "",
          city: business.city ?? "",
          region: business.region ?? "",
          postcode: business.postcode ?? "",
        }}
      />
    </>
  );
}
