import { RegionalForm } from "@/components/settings/regional-form";
import { requireBusiness } from "@/lib/auth/session";
import { formatBpsAsPercent } from "@/lib/money-input";

export const metadata = { title: "Regional and tax · Settings · Tradeslip" };

export default async function RegionalSettingsPage() {
  const business = await requireBusiness();

  return (
    <RegionalForm
      country={business.country}
      initial={{
        tax_enabled: business.tax_enabled,
        tax_label: business.tax_label,
        tax_rate: business.tax_enabled ? formatBpsAsPercent(business.tax_rate_bps) : "",
        tax_number: business.tax_number ?? "",
      }}
    />
  );
}
