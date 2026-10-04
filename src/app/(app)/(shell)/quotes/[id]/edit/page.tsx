import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { QuoteBuilder } from "@/components/quotes/quote-builder";
import { requireBusiness } from "@/lib/auth/session";
import { formatBpsAsPercent, formatCentsForInput } from "@/lib/money-input";
import { aiDraftingAvailable, builderConfig, loadBuilderOptions, loadPhotos, voiceNoteUrl } from "@/lib/quote-queries";
import { emptyCustomer, type QuoteFormValues } from "@/lib/schemas/quote";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Edit quote · Tradeslip" };

export default async function EditQuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const business = await requireBusiness();
  const supabase = await createClient();

  const { data: quote } = await supabase
    .from("quotes")
    .select("*, customers(id, name, email, phone, address_line1, city, region, postcode)")
    .eq("id", id)
    .eq("business_id", business.id)
    .maybeSingle();
  if (!quote) notFound();
  // Only drafts are editable; everything else is read-only on the detail page.
  if (quote.status !== "draft") redirect(`/quotes/${id}`);

  const [{ data: items }, options, photos, voiceAudioUrl] = await Promise.all([
    supabase.from("quote_items").select("*").eq("quote_id", id).order("position"),
    loadBuilderOptions(business.id),
    loadPhotos(business.id, id),
    voiceNoteUrl(quote.voice_note_path),
  ]);

  const c = quote.customers;
  const initialValues: QuoteFormValues = {
    customer: c
      ? {
          customer_id: c.id,
          name: c.name,
          email: c.email ?? "",
          phone: c.phone ?? "",
          address_line1: c.address_line1 ?? "",
          city: c.city ?? "",
          region: c.region ?? "",
          postcode: c.postcode ?? "",
        }
      : emptyCustomer(),
    title: quote.title ?? "",
    notes: quote.notes ?? "",
    valid_until: quote.valid_until ?? "",
    deposit_enabled: quote.deposit_enabled,
    deposit_percent: formatBpsAsPercent(quote.deposit_bps),
    include_photos: quote.include_photos,
    voice_note_path: quote.voice_note_path ?? "",
    transcript: quote.transcript ?? "",
    items: (items ?? []).map((i) => ({
      description: i.description,
      type: i.type,
      qty: String(Number(i.qty)),
      rate: i.unit_rate_cents === 0 && i.needs_price ? "" : formatCentsForInput(i.unit_rate_cents),
      price_item_id: i.price_item_id ?? "",
      needs_price: i.needs_price,
    })),
  };

  return (
    <QuoteBuilder
      quoteId={quote.id}
      number={quote.number}
      businessId={business.id}
      config={builderConfig(business)}
      customers={options.customers}
      priceItems={options.priceItems}
      photos={photos}
      aiEnabled={aiDraftingAvailable()}
      autoRecord={false}
      voiceAudioUrl={voiceAudioUrl}
      initialValues={initialValues}
    />
  );
}
