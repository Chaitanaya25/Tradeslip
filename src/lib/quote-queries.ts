import "server-only";
import type { BuilderConfig, CustomerOption, PriceItemOption } from "@/components/quotes/types";
import { REGIONS, quoteWord } from "@/lib/region";
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
    taxEnabled: business.tax_enabled,
    taxLabel: business.tax_label,
    taxRateBps: business.tax_rate_bps,
  };
}

/** Customers and active price-book items for the builder's pickers. */
export async function loadBuilderOptions(businessId: string) {
  const supabase = await createClient();
  const [customers, priceItems] = await Promise.all([
    supabase
      .from("customers")
      .select("id, name, email, phone, address_line1, city, region, postcode")
      .eq("business_id", businessId)
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
