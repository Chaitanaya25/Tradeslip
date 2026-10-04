import { QuoteBuilder } from "@/components/quotes/quote-builder";
import { requireBusiness } from "@/lib/auth/session";
import { defaultValidUntil, todayInTimezone } from "@/lib/quote-calc";
import { builderConfig, loadBuilderOptions } from "@/lib/quote-queries";
import { emptyCustomer, emptyItem } from "@/lib/schemas/quote";

export const metadata = { title: "New quote · Tradeslip" };

export default async function NewQuotePage() {
  const business = await requireBusiness();
  const { customers, priceItems } = await loadBuilderOptions(business.id);

  return (
    <QuoteBuilder
      quoteId={null}
      number={null}
      businessId={business.id}
      config={builderConfig(business)}
      customers={customers}
      priceItems={priceItems}
      photos={[]}
      initialValues={{
        customer: emptyCustomer(),
        title: "",
        notes: "",
        valid_until: defaultValidUntil(todayInTimezone(business.timezone), business.quote_validity_days),
        deposit_enabled: false,
        deposit_percent: "30",
        include_photos: false,
        items: [emptyItem()],
      }}
    />
  );
}
