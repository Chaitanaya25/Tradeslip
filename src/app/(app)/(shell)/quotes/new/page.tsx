import { QuoteBuilder } from "@/components/quotes/quote-builder";
import { requireBusiness } from "@/lib/auth/session";
import { defaultValidUntil, todayInTimezone } from "@/lib/quote-calc";
import { aiDraftingAvailable, builderConfig, loadBuilderOptions, loadPrefillCustomer } from "@/lib/quote-queries";
import { emptyItem } from "@/lib/schemas/quote";

export const metadata = { title: "New quote · Tradeslip" };

export default async function NewQuotePage({ searchParams }: { searchParams: Promise<{ record?: string; customerId?: string }> }) {
  const { record, customerId } = await searchParams;
  const business = await requireBusiness();
  const [{ customers, priceItems }, customer] = await Promise.all([loadBuilderOptions(business.id), loadPrefillCustomer(business.id, customerId)]);

  return (
    <QuoteBuilder
      quoteId={null}
      number={null}
      businessId={business.id}
      config={builderConfig(business)}
      customers={customers}
      priceItems={priceItems}
      photos={[]}
      aiEnabled={aiDraftingAvailable()}
      autoRecord={record === "1"}
      voiceAudioUrl={null}
      initialValues={{
        customer,
        title: "",
        notes: "",
        valid_until: defaultValidUntil(todayInTimezone(business.timezone), business.quote_validity_days),
        deposit_enabled: false,
        deposit_percent: "30",
        include_photos: false,
        voice_note_path: "",
        transcript: "",
        items: [emptyItem()],
      }}
    />
  );
}
