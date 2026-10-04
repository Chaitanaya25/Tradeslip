import "server-only";
import type { BuilderConfig, CustomerOption, PriceItemOption } from "@/components/quotes/types";
import { REGIONS, quoteWord } from "@/lib/region";
import { emptyCustomer, type QuoteFormValues } from "@/lib/schemas/quote";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { Business } from "@/lib/supabase/tables";
import type { PhotoDto } from "@/server/actions/quote-photos";

export function builderConfig(business: Business): BuilderConfig {
  return {
    country: business.country,
    currency: business.currency,
    locale: REGIONS[business.country].locale,
    quoteWord: quoteWord(business.country),
    docPrefix: business.quote_prefix,
    timezone: business.timezone,
    businessName: business.name,
    taxEnabled: business.tax_enabled,
    taxLabel: business.tax_label,
    taxRateBps: business.tax_rate_bps,
  };
}

/** Customers (not archived) and active price-book items for the builder's pickers. */
export async function loadBuilderOptions(businessId: string) {
  const supabase = await createClient();
  const [customers, priceItems] = await Promise.all([
    supabase
      .from("customers")
      .select("id, name, email, phone, address_line1, city, region, postcode")
      .eq("business_id", businessId)
      .eq("archived", false)
      .order("name")
      .limit(1000),
    supabase
      .from("price_items")
      .select("id, name, type, rate_cents, markup_bps")
      .eq("business_id", businessId)
      .eq("archived", false)
      .order("name")
      .limit(1000),
  ]);
  return {
    customers: (customers.data ?? []) as CustomerOption[],
    priceItems: (priceItems.data ?? []) as PriceItemOption[],
  };
}

/** A quote's photos with 1-hour signed URLs (the bucket is private). */
export async function loadPhotos(businessId: string, quoteId: string): Promise<PhotoDto[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("job_photos")
    .select("id, kind, storage_path")
    .eq("business_id", businessId)
    .eq("quote_id", quoteId)
    .order("position");
  const rows = data ?? [];
  if (rows.length === 0) return [];

  const { data: signed } = await supabase.storage.from("job-photos").createSignedUrls(
    rows.map((r) => r.storage_path),
    60 * 60,
  );
  const urlByPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
  return rows.map((r) => ({ id: r.id, kind: r.kind, storagePath: r.storage_path, url: urlByPath.get(r.storage_path) ?? null }));
}

/** Voice drafting is on unless switched off with AI_DRAFTING_ENABLED=false, and needs a Gemini key. */
export function aiDraftingAvailable(): boolean {
  return process.env.AI_DRAFTING_ENABLED !== "false" && Boolean(process.env.GEMINI_API_KEY);
}

/** 1-hour signed URL to play back a saved voice note (the bucket is private). */
export async function voiceNoteUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const supabase = await createClient();
  const { data } = await supabase.storage.from("voice-notes").createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}

/**
 * Customer details for `?customerId=` on the new quote / invoice pages. The id is validated against the
 * signed-in business (RLS plus an explicit business filter) and archived customers are refused.
 */
export async function loadPrefillCustomer(businessId: string, customerId: string | undefined): Promise<QuoteFormValues["customer"]> {
  if (!customerId || !z.uuid().safeParse(customerId).success) return emptyCustomer();
  const supabase = await createClient();
  const { data: c } = await supabase
    .from("customers")
    .select("id, name, email, phone, address_line1, city, region, postcode")
    .eq("id", customerId)
    .eq("business_id", businessId)
    .eq("archived", false)
    .maybeSingle();
  if (!c) return emptyCustomer();
  return {
    customer_id: c.id,
    name: c.name,
    email: c.email ?? "",
    phone: c.phone ?? "",
    address_line1: c.address_line1 ?? "",
    city: c.city ?? "",
    region: c.region ?? "",
    postcode: c.postcode ?? "",
  };
}
