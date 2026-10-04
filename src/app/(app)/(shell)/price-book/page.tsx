import { PriceBookView } from "@/components/price-book/price-book-view";
import { requireBusiness } from "@/lib/auth/session";
import { REGIONS } from "@/lib/region";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Price Book · Tradeslip" };

export default async function PriceBookPage() {
  const business = await requireBusiness();
  const supabase = await createClient();
  const { data } = await supabase
    .from("price_items")
    .select("id, name, type, unit, rate_cents, markup_bps, archived")
    .eq("business_id", business.id)
    .order("name");

  return (
    <PriceBookView
      items={data ?? []}
      currency={business.currency}
      locale={REGIONS[business.country].locale}
    />
  );
}
