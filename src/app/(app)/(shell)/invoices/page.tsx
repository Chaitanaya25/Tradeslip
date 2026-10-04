import { InvoicesList, type InvoiceRow } from "@/components/invoices/invoices-list";
import { requireBusiness } from "@/lib/auth/session";
import { todayInTimezone } from "@/lib/quote-calc";
import { REGIONS } from "@/lib/region";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Invoices · Tradeslip" };

export default async function InvoicesPage() {
  const business = await requireBusiness();
  const supabase = await createClient();
  const { data } = await supabase
    .from("invoices")
    .select("id, number, title, status, total_cents, amount_paid_cents, due_date, created_at, customers(name, address_line1, city)")
    .eq("business_id", business.id)
    .order("created_at", { ascending: false })
    .limit(1000);

  return (
    <InvoicesList
      invoices={(data ?? []) as unknown as InvoiceRow[]}
      currency={business.currency}
      locale={REGIONS[business.country].locale}
      today={todayInTimezone(business.timezone)}
      docPrefix={business.invoice_prefix}
    />
  );
}
