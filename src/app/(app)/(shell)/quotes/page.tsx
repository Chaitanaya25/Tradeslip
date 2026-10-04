import { QuotesList, type QuoteRow } from "@/components/quotes/quotes-list";
import { requireBusiness } from "@/lib/auth/session";
import { REGIONS, quoteWord } from "@/lib/region";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Quotes · Tradeslip" };

export default async function QuotesPage() {
  const business = await requireBusiness();
  const supabase = await createClient();
  const { data } = await supabase
    .from("quotes")
    .select("id, number, title, status, total_cents, created_at, sent_at, customers(name, address_line1, city)")
    .eq("business_id", business.id)
    .order("created_at", { ascending: false })
    .limit(1000);

  return (
    <QuotesList
      quotes={(data ?? []) as unknown as QuoteRow[]}
      currency={business.currency}
      locale={REGIONS[business.country].locale}
      timezone={business.timezone}
      docPrefix={business.quote_prefix}
      quoteWord={quoteWord(business.country)}
    />
  );
}
